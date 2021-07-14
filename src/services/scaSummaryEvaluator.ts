import { ScaConfig } from "../dto/sca/scaConfig";
import { SCAResults } from "../dto/sca/scaResults";
import { ScanSummary } from "../dto/scanSummary";
import { ScanSummaryEvaluator } from './scanSummaryEvaluator';

export class ScaSummaryEvaluator extends ScanSummaryEvaluator {
    constructor(private readonly config: ScaConfig) {
        super();
    }

    getScanSummary(scanResult: any,scaResults:SCAResults): ScanSummary {
        const result = new ScanSummary();
        result.policyCheck = this.getPolicyCheckSummary(scaResults);
        result.thresholdErrors = ScanSummaryEvaluator.getThresholdErrors(this.config.vulnerabilityThreshold, scanResult, this.config);
        return result;
    }

    private getPolicyCheckSummary(scaResults: SCAResults) {
        let result;
        if (this.config.scaEnablePolicyViolations) {
            result = {
                wasPerformed: true,
                violatedPolicyNames: scaResults.scaPolicies
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