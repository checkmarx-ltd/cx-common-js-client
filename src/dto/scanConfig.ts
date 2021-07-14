import { ScaConfig } from './sca/scaConfig';
import { SastConfig } from './sastConfig';
import {ProxyConfig} from "./proxyConfig";

export interface ScanConfig {
    sourceLocation: string;
    projectName: string;
    projectId?: number;
    isSyncMode: boolean;
    enableSastScan: boolean;
    enableDependencyScan: boolean;
    enableProxy: boolean;
    cxOrigin: string;
    cxOriginUrl:string;
    sastConfig?: SastConfig;
    scaConfig?: ScaConfig;
    proxyConfig?: ProxyConfig;
}