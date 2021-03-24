import * as url from 'url';
import * as path from "path";
import * as request from 'superagent';
import { Logger } from "../logger";
import { ScaLoginSettings } from "../../dto/sca/scaLoginSettings";
import { ScaClient } from './scaClient';
import { ProxyConfig } from "../..";
import { ProxyHelper } from "../proxyHelper";
import { SuperAgentRequest } from "superagent";
import fs = require('fs');
import pac = require('pac-resolver');


interface InternalRequestOptions extends RequestOptions {
    method: 'put' | 'post' | 'get';
    singlePostData?: object;
    multipartPostData?: {
        fields: { [fieldName: string]: any },

        // Key: attachment field name.
        // Value: path of the file to attach.
        attachments: { [fieldName: string]: string }
    };
    retry: boolean;
}

interface RequestOptions {
    baseUrlOverride?: string;
    suppressWarnings?: boolean;
}

/**
 * Implements low-level API request logic.
 */
export class HttpClient {
    accessToken: string = '';
    cookies: Map<string, string> = new Map<string, string>();

    private username = '';
    private password = '';
    private proxyResult = '';
    private proxyContent = '';
    private scaSettings: ScaLoginSettings | any;
    private isSsoLogin: boolean = false;
    constructor(private readonly baseUrl: string, private readonly origin: string, private readonly log: Logger, private readonly proxyConfig?: ProxyConfig) {
    }
    async getProxyContent() {
        require('superagent-proxy')(request);
        if (this.proxyConfig?.proxyUrl) {
            await request.get(this.proxyConfig?.proxyUrl)
                .accept('json')
                .then((res: { text: string; }) => {
                    this.proxyContent = res.text;
                });
        }
    }
    async getPacProxyResolve() {
        if (this.proxyConfig) {
            if (this.proxyConfig.proxyUrl) {
                if (this.proxyConfig.proxyUrl.startsWith("pac", 0) || this.proxyConfig.proxyUrl.startsWith("PAC", 0)) {
                    this.proxyConfig.proxyUrl = this.proxyConfig.proxyUrl.replace("pac+", "");
                    await this.getProxyContent();
                    let FindProxyForURL = pac(this.proxyContent);
                    await FindProxyForURL(this.baseUrl,"").then((res) => {
                        this.proxyResult = res;
                        if (this.proxyConfig) {
                            let splitted;
                            let proxyBefore;
                            if (this.proxyResult) {
                                proxyBefore = this.proxyResult.split(";");
                                this.proxyResult = proxyBefore[0];
                                splitted = this.proxyResult.split(" ");
                                if (splitted[0].toUpperCase() == "HTTP" || splitted[0].toUpperCase() == "PROXY")
                                    this.proxyConfig.proxyUrl = 'http://' + splitted[1];
                                else if (splitted[0].toUpperCase() == "HTTPS")
                                    this.proxyConfig.proxyUrl = 'https://' + splitted[1];
                                else if (splitted[0].toUpperCase() == "SOCKS" )
                                    this.proxyConfig.proxyUrl = 'socks://' + splitted[1];
                                else if (splitted[0].toUpperCase() == "SOCKS4")
                                    this.proxyConfig.proxyUrl = 'socks4://' + splitted[1];
                                else if (splitted[0].toUpperCase() == "SOCKS5")
                                    this.proxyConfig.proxyUrl = 'socks5://' + splitted[1];
                                else if (splitted[0].toUpperCase() == "DIRECT")
                                    this.proxyConfig.proxyUrl = '';
                                else if (splitted[0].toUpperCase() != "HTTP" || splitted[0].toUpperCase() != "PROXY" || splitted[0].toUpperCase() != "SOCKS" || splitted[0].toUpperCase() != "SOCKS4" || splitted[0].toUpperCase() != "SOCKS5")
                                    this.log.warning("We Support only http,https,socks,socks4,socks5 please correct ");
                                this.log.info("Proxy URL : " + this.proxyConfig.proxyUrl);
                            }
                        }
                    });
                }
            }
        }
    }
    login(username: string, password: string) {
        this.log.info('Logging into the Checkmarx service.');
        this.username = username;
        this.password = password;
        return this.loginWithStoredCredentials();
    }

    logout() {
        this.log.info('Logging out from Checkmarx service.');
        this.accessToken = '';
        this.username = '';
        this.password = '';
        this.cookies.clear();
        this.isSsoLogin = false;
    }

    getRequest(relativePath: string, options?: RequestOptions): Promise<any> {
        const internalOptions: InternalRequestOptions = { retry: true, method: 'get' };
        return this.sendRequest(relativePath, Object.assign(internalOptions, options));
    }

    postRequest(relativePath: string, data: object): Promise<any> {
        return this.sendRequest(relativePath, { singlePostData: data, retry: true, method: 'post' });
    }

    putRequest(relativePath: string, data: object): Promise<any> {
        return this.sendRequest(relativePath, { singlePostData: data, retry: true, method: 'put' });
    }

    postMultipartRequest(relativePath: string,
        fields: { [fieldName: string]: any },
        attachments: { [fieldName: string]: string }) {
        return this.sendRequest(relativePath, {
            method: 'post',
            multipartPostData: {
                fields,
                attachments
            },
            retry: true
        });
    }

    private sendRequest(relativePath: string, options: InternalRequestOptions): Promise<any> {
        require('superagent-proxy')(request);

        const effectiveBaseUrl = options.baseUrlOverride || this.baseUrl;
        const fullUrl = url.resolve(effectiveBaseUrl, relativePath);

        this.log.debug(`Sending ${options.method.toUpperCase()} request to ${fullUrl}`);
        let proxyUrl;
        if (this.proxyConfig) {
            proxyUrl = ProxyHelper.getFormattedProxy(this.proxyConfig);
        }

        let result: SuperAgentRequest;
        if (proxyUrl) {
            result = request[options.method](fullUrl)
                .accept('json')
                .set('cxOrigin', this.origin)
                .proxy(proxyUrl);
        } else {
            result = request[options.method](fullUrl)
                .accept('json')
                .set('cxOrigin', this.origin);
        }

        if (this.accessToken) {
            result.auth(this.accessToken, { type: 'bearer' });
        }

        if (this.cookies && this.cookies.size > 0) {
            this.cookies.forEach((value, key) => {
                result.set(key, value);
            });
        }

        if (this.scaSettings && this.scaSettings.apiUrl === this.baseUrl) {
            // Pass tenant name in a custom header. This will allow to get token from on-premise access control server
            // and then use this token for SCA authentication in cloud.
            result.set(ScaClient.TENANT_HEADER_NAME, this.scaSettings.tenant);
        }

        result = HttpClient.includePostData(result, options);

        return result.then(
            (response: request.Response) => response.body,
            async (err: any) => this.handleHttpError(options, err, relativePath, fullUrl)
        );
    }

    private async handleHttpError(options: InternalRequestOptions, err: any, relativePath: string, fullUrl: string) {
        const canRetry = options.retry && err && err.response && err.response.unauthorized;
        if (canRetry) {
            this.log.warning('Access token expired, requesting a new token');

            if (this.scaSettings && this.scaSettings.apiUrl === this.baseUrl) {
                await this.scaLogin(this.scaSettings);
            } else if (this.username && this.password) {
                await this.loginWithStoredCredentials();
            } else if (this.isSsoLogin) {
                this.ssoLogin();
            }

            const optionsClone = Object.assign({}, options);
            // Avoid infinite recursion.
            optionsClone.retry = false;
            return this.sendRequest(relativePath, optionsClone);
        } else {
            const message = `${options.method.toUpperCase()} request failed to ${fullUrl}`;
            const logMethod = options.suppressWarnings ? 'debug' : 'warning';
            this.log[logMethod](message);
            return Promise.reject(err);
        }
    }

    private static includePostData(result: request.SuperAgentRequest, options: InternalRequestOptions) {
        if (options.singlePostData) {
            result = result.send(options.singlePostData);
        } else if (options.multipartPostData) {
            const { fields, attachments } = options.multipartPostData;

            for (const prop in fields) {
                result = result.field(prop, fields[prop]);
            }

            for (const prop in attachments) {
                result = result.attach(prop, attachments[prop]);
            }
        }
        return result;
    }

    private loginWithStoredCredentials() {
        require('superagent-proxy')(request);
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
        const fullUrl = url.resolve(this.baseUrl, 'auth/identity/connect/token');
        let proxyUrl;
        if (this.proxyConfig) {
            proxyUrl = ProxyHelper.getFormattedProxy(this.proxyConfig);
        }
        let newRequest = request
            .post(fullUrl)
            .type('form');
        if (proxyUrl) {
            newRequest.proxy(proxyUrl);
        }
        return newRequest.send({
            userName: this.username,
            password: this.password,
            grant_type: 'password',
            scope: 'sast_rest_api',
            client_id: 'resource_owner_client',
            client_secret: '014DF517-39D1-4453-B7B3-9930C563627C'
        })
            .then(
                (response: request.Response) => {
                    this.accessToken = response.body.access_token;
                },
                (err: any) => {
                    const status = err && err.response ? (err.response as request.Response).status : 'n/a';
                    const message = err && err.message ? err.message : 'n/a';
                    this.log.error(`POST request failed to ${fullUrl}. HTTP status: ${status}, message: ${message}`);
                    throw Error('Login failed');
                }
            );
    }

    async scaLogin(settings: ScaLoginSettings) {
        require('superagent-proxy')(request);
        this.scaSettings = settings;
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
        const fullUrl = url.resolve(settings.accessControlBaseUrl, ScaClient.AUTHENTICATION);
        let proxyUrl;
        if (this.proxyConfig) {
            proxyUrl = ProxyHelper.getFormattedProxy(this.proxyConfig);
        }
        let newRequest = request
            .post(fullUrl)
            .type('form');
        if (proxyUrl) {
            newRequest.proxy(proxyUrl)
        }
        // Pass tenant name in a custom header. This will allow to get token from on-premise access control server
        // and then use this token for SCA authentication in cloud.
        return newRequest.set(ScaClient.TENANT_HEADER_NAME, settings.tenant)
            .send({
                userName: settings.username,
                password: settings.password,
                grant_type: 'password',
                scope: settings.clientTypeForPasswordAuth.scopes,
                client_id: settings.clientTypeForPasswordAuth.clientId,
                client_secret: settings.clientTypeForPasswordAuth.clientSecret,
                acr_values: 'Tenant:' + settings.tenant
            })
            .then(
                (response: request.Response) => {
                    this.accessToken = response.body.access_token;
                },
                (err: any) => {
                    const status = err && err.response ? (err.response as request.Response).status : 'n/a';
                    const message = err && err.message ? err.message : 'n/a';
                    this.log.error(`POST request failed to ${fullUrl}. HTTP status: ${status}, message: ${message}`);
                    throw Error('Login failed');
                }
            );
    }

    async ssoLogin() {
        this.log.info('Logging into the Checkmarx service using SSO');
        process.chdir(`${__dirname}/../../../../cli`);
        const child_process = require('child_process');
        const script: string = path.sep === "/" ? 'runCxConsole.sh' : 'runCxConsole.cmd';
        const sastUrl: string = this.baseUrl.replace('/CxRestAPI/', '');
        const command = `${script} TestConnection -CxServer ${sastUrl} -usesso -v`;
        const output: string = child_process.execSync(command).toString();
        output.split(/\r?\n/).forEach((line) => {
            if (line.includes('Access Token: ')) {
                this.accessToken = line.split('Access Token: ')[1];
            } else if (line.includes('CXCSRFToken: ')) {
                this.cookies.set('CXCSRFToken', line.split('CXCSRFToken: ')[1]);
            } else if (line.includes('cookie: ')) {
                this.cookies.set('cookie', line.split('cookie: ')[1]);
            }
        });
        this.isSsoLogin = true;
    }
}
