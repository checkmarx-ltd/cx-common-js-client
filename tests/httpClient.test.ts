import * as assert from "assert";
import { HttpClient, Logger } from "../src";

function createLogger() {
    const warnings: string[] = [];
    const logger: Logger = {
        error: () => { },
        info: () => { },
        debug: () => { },
        warning: (message: string) => {
            warnings.push(message);
        }
    };

    return { logger, warnings };
}

function createClient(logger: Logger): HttpClient {
    return new HttpClient(
        "https://sca.example/",
        "azure-plugin",
        "https://origin.example/",
        logger
    );
}

describe("HttpClient", function () {
    it("should retry when status is 403 and message matches explicit deny token-expired case", async function () {
        const { logger } = createLogger();
        const client = createClient(logger) as any;
        const expectedMessage =
            "user is not authorized to access this resource with an explicit deny in an identity-based policy";

        let scaLoginCalled = 0;
        let retriedWithRetryFlag = true;

        client.scaSettings = {
            apiUrl: "https://sca.example/",
            accessControlBaseUrl: "https://ac.example/",
            username: "u",
            password: "p",
            tenant: "t",
            clientTypeForPasswordAuth: {}
        };
        client.scaLogin = async () => {
            scaLoginCalled++;
        };
        client.sendRequest = async (_relativePath: string, options: { retry: boolean }) => {
            retriedWithRetryFlag = options.retry;
            return "retried";
        };

        const result = await client.handleHttpError(
            { retry: true, method: "post", suppressWarnings: false },
            { response: { status: 403, text: expectedMessage } },
            "/api/uploads",
            "https://sca.example/api/uploads"
        );

        assert.strictEqual(result, "retried");
        assert.strictEqual(scaLoginCalled, 1);
        assert.strictEqual(retriedWithRetryFlag, false);
    });

    it("should not retry when status is 403 and message does not match explicit deny text", async function () {
        const { logger } = createLogger();
        const client = createClient(logger) as any;
        const err = {
            response: {
                status: 403,
                text: "forbidden because role is missing"
            }
        };

        let sendRequestCalled = false;
        client.sendRequest = async () => {
            sendRequestCalled = true;
            return "retried";
        };

        await assert.rejects(
            async () => client.handleHttpError(
                { retry: true, method: "post", suppressWarnings: false },
                err,
                "/api/uploads",
                "https://sca.example/api/uploads"
            ),
            (thrownErr: unknown) => {
                assert.strictEqual(thrownErr, err);
                return true;
            }
        );

        assert.strictEqual(sendRequestCalled, false);
    });

    it("should retry on 401 unauthorized", async function () {
        const { logger } = createLogger();
        const client = createClient(logger) as any;

        let loginCalled = 0;
        let retriedWithRetryFlag = true;

        client.username = "user";
        client.password = "pass";
        client.loginWithStoredCredentials = async () => {
            loginCalled++;
        };
        client.sendRequest = async (_relativePath: string, options: { retry: boolean }) => {
            retriedWithRetryFlag = options.retry;
            return "retried-401";
        };

        const result = await client.handleHttpError(
            { retry: true, method: "get", suppressWarnings: false },
            { response: { status: 401 } },
            "/api/scans",
            "https://sca.example/api/scans"
        );

        assert.strictEqual(result, "retried-401");
        assert.strictEqual(loginCalled, 1);
        assert.strictEqual(retriedWithRetryFlag, false);
    });

    describe("isExpiredToken403", function () {
        const expectedMessage =
            "user is not authorized to access this resource with an explicit deny in an identity-based policy";

        it("returns true when status is 403 and message matches (response.text)", function () {
            const { logger } = createLogger();
            const client = createClient(logger) as any;
            const err = { response: { status: 403, text: expectedMessage } };
            assert.strictEqual(client.isExpiredToken403(err), true);
        });

        it("returns true when status is 403 and message in body.message (JSON response)", function () {
            const { logger } = createLogger();
            const client = createClient(logger) as any;
            const err = {
                response: {
                    status: 403,
                    body: { message: "User is not authorized to access this resource with an explicit deny in an identity-based policy" }
                }
            };
            assert.strictEqual(client.isExpiredToken403(err), true);
        });

        it("returns true when message has extra text but contains expected phrase", function () {
            const { logger } = createLogger();
            const client = createClient(logger) as any;
            const err = {
                response: {
                    status: 403,
                    body: { message: "Forbidden. User is not authorized to access this resource with an explicit deny in an identity-based policy" }
                }
            };
            assert.strictEqual(client.isExpiredToken403(err), true);
        });

        it("returns false when status is 403 but message is permission-related", function () {
            const { logger } = createLogger();
            const client = createClient(logger) as any;
            const err = { response: { status: 403, text: "Permission denied" } };
            assert.strictEqual(client.isExpiredToken403(err), false);
        });

        it("returns false when status is 403 but message is different", function () {
            const { logger } = createLogger();
            const client = createClient(logger) as any;
            const err = { response: { status: 403, text: "Insufficient permissions" } };
            assert.strictEqual(client.isExpiredToken403(err), false);
        });

        it("returns false when status is not 403", function () {
            const { logger } = createLogger();
            const client = createClient(logger) as any;
            const err = { response: { status: 401, text: expectedMessage } };
            assert.strictEqual(client.isExpiredToken403(err), false);
        });

        it("returns false when err is null (no undefined access)", function () {
            const { logger } = createLogger();
            const client = createClient(logger) as any;
            assert.strictEqual(client.isExpiredToken403(null), false);
        });

        it("returns false when err is undefined (no undefined access)", function () {
            const { logger } = createLogger();
            const client = createClient(logger) as any;
            assert.strictEqual(client.isExpiredToken403(undefined), false);
        });

        it("returns false when status is 403 but response.body and message are undefined (Umesh fix)", function () {
            const { logger } = createLogger();
            const client = createClient(logger) as any;
            const err = { response: { status: 403 } };
            assert.strictEqual(client.isExpiredToken403(err), false);
        });
    });

    describe("getErrorMessage", function () {
        it("returns empty string when err is null", function () {
            const { logger } = createLogger();
            const client = createClient(logger) as any;
            assert.strictEqual(client.getErrorMessage(null), "");
        });

        it("returns empty string when err is undefined", function () {
            const { logger } = createLogger();
            const client = createClient(logger) as any;
            assert.strictEqual(client.getErrorMessage(undefined), "");
        });

        it("does not throw when err.response.body is undefined (reading message)", function () {
            const { logger } = createLogger();
            const client = createClient(logger) as any;
            const err = { response: { status: 403 } };
            assert.doesNotThrow(() => client.getErrorMessage(err));
            assert.strictEqual(client.getErrorMessage(err), "");
        });

        it("returns message from err.response.body.message when present", function () {
            const { logger } = createLogger();
            const client = createClient(logger) as any;
            const err = { response: { body: { message: "User is not authorized..." } } };
            assert.strictEqual(client.getErrorMessage(err), "User is not authorized...");
        });

        it("returns message from err.message when body is missing", function () {
            const { logger } = createLogger();
            const client = createClient(logger) as any;
            const err = { message: "Forbidden" };
            assert.strictEqual(client.getErrorMessage(err), "Forbidden");
        });
    });
});