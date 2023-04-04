import { SourceLocationType } from './sourceLocationType';
import { RemoteRepositoryInfo } from './remoteRepositoryInfo';

export interface ScaConfig {
    apiUrl: string;
    accessControlUrl: string;
    username: string;
    password: string;
    tenant: string;
    webAppUrl: string;
    sourceLocationType: SourceLocationType;
    remoteRepositoryInfo?: RemoteRepositoryInfo;
    fingerprintsFilePath?: string;
    includeSource?: boolean
    dependencyFileExtension: string;
    dependencyFolderExclusion: string;
    vulnerabilityThreshold: boolean;
    highThreshold?: number;
    mediumThreshold?: number;
    lowThreshold?: number;
    scaEnablePolicyViolations: boolean;
    sastProjectId:string;
    sastProjectName:string;
    sastServerUrl:string;
    sastUsername:string;
    sastPassword:string;
    configFilePaths:string[];
    envVariables:Map<string, string>;
    scaSastTeam:string;
    projectCustomTags:string;
    scanCustomTags:string;
    isExploitable:boolean;
    manifestPattern:string;
    fingerprintPattern:string;
    cacert_chainFilePath: string;
    isEnableScaResolver: boolean ;
    pathToScaResolver: string;
    scaResolverAddParameters: string;
    scaScanTimeoutInMinutes?: number;
}