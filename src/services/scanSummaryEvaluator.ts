import { ThresholdError } from "../dto/thresholdError";
import { ScanSummary } from "../dto/scanSummary";
import { SCAResults } from "../dto/sca/scaResults";
import { NewVulnerabilitiesThresholdError } from "../dto/newVulnerabilitiesThresholdError";

export abstract class ScanSummaryEvaluator {
    /**
     * Generates scan summary with error info, if any.
     */
    protected abstract getScanSummary(scanResult: any,scaResults:SCAResults): ScanSummary;

    protected static getThresholdErrors(vulnerabilityThreshold: boolean, scanResult: any, config: any) {
        let result: ThresholdError[];
        if (vulnerabilityThreshold) {
            result = ScanSummaryEvaluator.getSastThresholdErrors(scanResult, config);
        } else {
            result = [];
        }
        return result;
    }

    private static getSastThresholdErrors(scanResult: any, config: any) {
        const result: ThresholdError[] = [];
        ScanSummaryEvaluator.addThresholdErrors(scanResult.highResults, config.highThreshold, 'high', result);
        ScanSummaryEvaluator.addThresholdErrors(scanResult.mediumResults, config.mediumThreshold, 'medium', result);
        ScanSummaryEvaluator.addThresholdErrors(scanResult.lowResults, config.lowThreshold, 'low', result);
        return result;
    }

    private static addThresholdErrors(amountToCheck: number,
        threshold: number | undefined,
        severity: string,
        target: ThresholdError[]) {
        if (typeof threshold !== 'undefined') {
            if (threshold < 0) {
                throw Error('Threshold must be 0 or greater');
            }

            if (amountToCheck > threshold) {
                target.push({
                    severity,
                    actualViolationCount: amountToCheck,
                    threshold
                });
            }
        }
    }

    protected static getNewVulnerabilitiesThresholdErrors(scanResult: any, config: any){
        let result: NewVulnerabilitiesThresholdError[];
        if(config.failBuildForNewVulnerabilitiesEnabled){
            result = ScanSummaryEvaluator.getSastNewVulnerabilitiesThresholdErrors(scanResult, config)
        }
        else{
            result = [];
        }
        return result;
    }

    private static getSastNewVulnerabilitiesThresholdErrors(scanResult: any, config: any) {
        const result: NewVulnerabilitiesThresholdError[] = [];
        var severity = config.failBuildForNewVulnerabilitiesSeverity;

        if(severity === "LOW"){
            if(scanResult.newLowCount > 0){
                result.push({
                    severity, 
                    severityCount: scanResult.newLowCount
                });
            }
            severity = "MEDIUM";
        }
        if(severity === "MEDIUM"){
            if(scanResult.newMediumCount > 0){
                result.push({
                    severity, 
                    severityCount: scanResult.newMediumCount
                });
            }
            severity = "HIGH";
        }
        if(severity === "HIGH" && scanResult.newHighCount > 0){
            result.push({
                severity, 
                severityCount: scanResult.newHighCount
            });            
        }
        return result;
    }
}