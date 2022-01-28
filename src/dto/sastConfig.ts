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
    isIncremental: boolean;
    forceScan: boolean;
    comment: string;
    presetName: string;
    presetId?: number;
    scanTimeoutInMinutes?: number;
    enablePolicyViolations: boolean;
    generatePDFReport: boolean;
    vulnerabilityThreshold: boolean;
    highThreshold?: number;
    mediumThreshold?: number;
    lowThreshold?: number;
    cacert_chainFilePath: string;
    customFields: string;
    engineConfigurationId?: number;
    postScanActionName: string;
    postScanActionId?: number;
    avoidDuplicateProjectScans:boolean;
}