import { SastConfig } from "./sastConfig";
import { ScaReportResults } from "./sca/scaReportResults";

/**
 * Most OSA-related fields are currently not in use.
 * They are kept here to avoid changes in HTML report generation and also for possible reuse in other plugins.
 */
export class ScanResults {
    buildFailed = false;
    errorOccurred = false;
    url: string = '';
    syncMode: boolean = false;
    osaEnabled = false;
    enablePolicyViolations: boolean = false;
    osaThresholdExceeded = false;
    sastThresholdExceeded = false;
    sastResultsReady = false;
    scanId = 0;
    thresholdEnabled: boolean = false;

    criticalThreshold: number | undefined;
    highThreshold: number | undefined;
    mediumThreshold: number | undefined;
    lowThreshold: number | undefined;

    osaFailed = false;
    osaScanId: string | null = null;
    osaProjectSummaryLink: string | null = null;
    osaThresholdEnabled = false;
    osaCriticalThreshold = 0;
    osaHighThreshold = 0;
    osaMediumThreshold = 0;
    osaLowThreshold = 0;

    sastViolations: {
        libraryName: string,
        policyName: string,
        ruleName: string,
        detectionDate: string
    }[] = [];
    sastPolicies: string[] = [];
    osaViolations = [];
    osaPolicies = [];
    failBuildForNewVulnerabilitiesEnabled: boolean = false;
    criticalResults = 0;
    highResults = 0;
    mediumResults = 0;
    lowResults = 0;
    infoResults = 0;
    newCriticalCount = 0;
    newHighCount = 0;
    newMediumCount = 0;
    newLowCount = 0;
    newInfoCount = 0;

    sastScanResultsLink = '';
    sastSummaryResultsLink = '';

    generatePDFReport = false ;
    reportPDF = [];

    scanStart = '';    // E.g. "Sunday, October 27, 2019 1:58:48 PM"
    scanTime = '';     // E.g. "00h:03m:25s"

    locScanned = 0;
    filesScanned = 0;

    // TODO: check if this is needed anywhere.
    // riskLevel = null;
    // projectId = 0;
    // newHighCount = 0;
    // newMediumCount = 0;
    // newLowCount = 0;
    // newInfoCount = 0;

    //SCA Results
    scaResults?: ScaReportResults;

    queryList = '';
    osaStartTime = '';  // E.g. "2019-10-27T12:22:50.223"
    osaEndTime = '';
    osaCriticalResults = 0;
    osaHighResults = 0;
    osaMediumResults = 0;
    osaLowResults = 0;
    osaSummaryResultsLink = '';
    osaVulnerableLibraries = 0;
    osaOkLibraries = 0;

    public updateSastDefaultResults(sastConfig: SastConfig) {
        this.url = sastConfig.serverUrl;
        this.enablePolicyViolations = sastConfig.enablePolicyViolations;
        this.thresholdEnabled = sastConfig.vulnerabilityThreshold;
        this.criticalThreshold = sastConfig.criticalThreshold;
        this.highThreshold = sastConfig.highThreshold;
        this.mediumThreshold = sastConfig.mediumThreshold;
        this.lowThreshold = sastConfig.lowThreshold;
        this.failBuildForNewVulnerabilitiesEnabled = sastConfig.failBuildForNewVulnerabilitiesEnabled;
    }

    constructor() {
    }
}