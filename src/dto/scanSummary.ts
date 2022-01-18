import { ThresholdError } from "./thresholdError";
import { NewVulnerabilitiesThresholdError } from "./newVulnerabilitiesThresholdError";

export class ScanSummary {
    policyCheck: {
        wasPerformed: boolean,
        violatedPolicyNames: string[]
    } = { wasPerformed: false, violatedPolicyNames: [] };

    thresholdErrors: ThresholdError[] = [];
    newVulnerabilitiesThresholdErrors: NewVulnerabilitiesThresholdError[] = [];

    hasErrors = () => !!(this.policyCheck.violatedPolicyNames.length || this.thresholdErrors.length || this.newVulnerabilitiesThresholdErrors.length);
    hasThresholdErrors = () => !!(this.thresholdErrors.length);
}