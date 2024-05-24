import { SastSummaryEvaluator } from "../src/services/sastSummaryEvaluator";
import { ScanResults } from "../src";
import { SastConfig } from "../src";
import * as assert from "assert";

describe("ScanSummaryEvaluator", function () {
    it('should return violated policy names in summary', function () {
        const config = getSastConfig();
        config.enablePolicyViolations = true;

        const target = new SastSummaryEvaluator(config, true);

        const scanResults = new ScanResults();
        scanResults.updateSastDefaultResults(config);
        scanResults.sastPolicies = ['policy1', 'policy2'];
        const summary = target.getScanSummary(scanResults);

        assert.ok(summary);
        assert.ok(summary.hasErrors());
        assert.ok(summary.policyCheck);
        assert.ok(summary.policyCheck.wasPerformed);
        assert.deepStrictEqual(summary.policyCheck.violatedPolicyNames, scanResults.sastPolicies);
    });

    it('should return threshold errors in summary', function () {
        const config = getSastConfig();
        config.criticalThreshold = 3;
        config.highThreshold = 1;
        config.mediumThreshold = 5;
        config.lowThreshold = 10;
        config.vulnerabilityThreshold = true;

        const target = new SastSummaryEvaluator(config, false);

        const scanResults = new ScanResults();
        scanResults.updateSastDefaultResults(config);
        scanResults.criticalResults = 1;
        scanResults.highResults = 3;
        scanResults.mediumResults = 8;
        scanResults.lowResults = 4;
        const summary = target.getScanSummary(scanResults);

        assert.ok(summary.hasErrors());
        assert.equal(summary.thresholdErrors.length, 2);
    });

    it('should not return threshold errors if all values are below thresholds', function () {
        const config = getSastConfig();
        config.criticalThreshold = 10;
        config.highThreshold = 10;
        config.mediumThreshold = 15;
        config.lowThreshold = 20;
        config.vulnerabilityThreshold = true;

        const target = new SastSummaryEvaluator(config, false);

        const scanResults = new ScanResults();
        scanResults.updateSastDefaultResults(config);
        scanResults.criticalResults = 2;
        scanResults.highResults = 2;
        scanResults.mediumResults = 11;
        scanResults.lowResults = 18;
        const summary = target.getScanSummary(scanResults);

        assert.ok(!summary.hasErrors());
        assert.equal(summary.thresholdErrors.length, 0);
    });
});

function getSastConfig(): SastConfig {
    return {
        criticalThreshold: 0,
        highThreshold: 0,
        lowThreshold: 0,
        mediumThreshold: 0,
        presetId: 0,
        scanTimeoutInMinutes: 0,
        teamId: 0,
        comment: "",
        denyProject: false,
        enablePolicyViolations: false,
        fileExtension: "",
        folderExclusion: "",
        forceScan: false,
        isIncremental: false,
        isPublic: false,
        password: "",
        presetName: "",
        serverUrl: "",
        teamName: "",
        username: "",
        vulnerabilityThreshold: false
    };
}
