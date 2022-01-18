import { ScanResults } from "..";
import { SastConfig } from "../dto/sastConfig";
import { ScanSummary } from "../dto/scanSummary";
import { ScanSummaryEvaluator } from './scanSummaryEvaluator';

export class SastSummaryEvaluator extends ScanSummaryEvaluator {
    constructor(private readonly config: SastConfig,
        private readonly isPolicyEnforcementSupported: boolean) {
        super();
    }

    //result here is summary object in CxClient
    getScanSummary(scanResult: ScanResults): ScanSummary {
        const result = new ScanSummary();
        result.policyCheck = this.getPolicyCheckSummary(scanResult);
        result.thresholdErrors = ScanSummaryEvaluator.getThresholdErrors(this.config.vulnerabilityThreshold, scanResult, this.config);
        result.newVulnerabilitiesThresholdErrors = ScanSummaryEvaluator.getNewVulnerabilitiesThresholdErrors(scanResult, this.config) ;
        return result;
    }

    private getPolicyCheckSummary(scanResult: ScanResults) {
        let result;
        if (this.config.enablePolicyViolations && this.isPolicyEnforcementSupported) {
            result = {
                wasPerformed: true,
                violatedPolicyNames: scanResult.sastPolicies
            };
        } else {
            result = {
                wasPerformed: false,
                violatedPolicyNames: []
            };
        }
        return result;
    }
}