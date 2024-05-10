export interface SastConfig {
    username: string;
    password: string;
    teamName: string;
    teamId?: number;
    serverUrl: string;
    isPublic: boolean;
    denyProject: boolean;
    folderExclusion: string;
    fileExtension: string;
    overrideProjectSettings: boolean;
    isIncremental: boolean;
    forceScan: boolean;
    comment: string;
    presetName: string;
    presetId?: number;
    scanTimeoutInMinutes?: number;
    enablePolicyViolations: boolean;
    generatePDFReport: boolean;
    vulnerabilityThreshold: boolean;
    failBuildForNewVulnerabilitiesEnabled: boolean;
    failBuildForNewVulnerabilitiesSeverity: string;
    criticalThreshold?: number;
    highThreshold?: number;
    mediumThreshold?: number;
    lowThreshold?: number;
    cacert_chainFilePath: string;
    projectCustomFields: string;
    customFields: string;
    engineConfigurationId?: number;
    postScanActionName: string;
    postScanActionId?: number;
    avoidDuplicateProjectScans:boolean;
    enableSastBranching:boolean;
    masterBranchProjectName: string;
}