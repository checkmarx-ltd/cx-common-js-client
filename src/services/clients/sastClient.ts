import { ScanRequest } from "../../dto/api/scanRequest";
import { SastConfig } from "../../dto/sastConfig";
import { HttpClient } from "./httpClient";
import { ScanStatus } from "../../dto/api/scanStatus";
import { ScanStage } from "../../dto/api/scanStage";
import { Stopwatch } from "../stopwatch";
import { UpdateScanSettingsRequest } from "../../dto/api/updateScanSettingsRequest";
import { Waiter } from "../waiter";
import { Logger } from "../logger";
import { PollingSettings } from "../../dto/pollingSettings";

export class SastClient {
    private static readonly POLLING_INTERVAL_IN_SECONDS = 10;

    private static readonly SCAN_COMPLETED_MESSAGE = 'Scan completed';

    private readonly stopwatch = new Stopwatch();

    private scanId: number = 0;

    constructor(private readonly config: SastConfig,
        private readonly httpClient: HttpClient,
        private readonly log: Logger) {
    }

    async getPresetIdByName(presetName: string) {
        this.log.debug(`Getting preset ID by name: [${presetName}]`);
        const allPresets = await this.httpClient.getRequest('sast/presets') as [{ name: string, id: number }];
        const currentPresetName = this.config.presetName.toUpperCase();
        let result: number = 0;
        for (const preset of allPresets) {
            if (preset.name.toUpperCase() === currentPresetName) {
                result = preset.id;
                break;
            }
        }

        if (result) {
            this.log.debug(`Resolved preset ID: ${result}`);
        } else {
            throw Error(`Could not resolve preset ID from preset name: ${presetName}`);
        }

        return result;
    }

    getScanSettings(projectId: number) {
        this.log.info('Getting scan settings.');
        return this.httpClient.getRequest(`sast/scanSettings/${projectId}`);
    }

    async createScan(projectId: number) {
        const request: ScanRequest = {
            projectId,
            isIncremental: this.config.isIncremental,
            isPublic: this.config.isPublic,
            forceScan: this.config.forceScan,
            comment: this.config.comment
        };

        const scan = await this.httpClient.postRequest('sast/scans', request);
        this.scanId = scan.id;

        this.stopwatch.start();
        return scan.id;
    }

    setScanId(scanId:number){
        this.scanId = scanId;
    }

    getScanStatistics(scanId: number) {
        return this.httpClient.getRequest(`sast/scans/${scanId}/resultsStatistics`);
    }

    updateScanSettings(request: UpdateScanSettingsRequest) {
        this.log.info('Updating scan settings.');
        return this.httpClient.putRequest('sast/pluginsScanSettings', request);
    }

    async waitForScanToFinish() {
        this.log.info('Waiting for CxSAST scan to finish.');

        const polling: PollingSettings = {
            masterTimeoutMinutes: this.config.scanTimeoutInMinutes,
            intervalSeconds: SastClient.POLLING_INTERVAL_IN_SECONDS
        };

        let lastStatus;
        const waiter = new Waiter();
        try {
            lastStatus = await waiter.waitForTaskToFinish(
                this.checkIfScanFinished,
                this.logWaitingProgress,
                polling);
        } catch (e) {
            throw Error(`Waiting for CxSAST scan has reached the time limit (${polling.masterTimeoutMinutes} minutes).`);
        }

        if (SastClient.isFinishedSuccessfully(lastStatus)) {
            this.log.info('SAST scan successfully finished.');
        } else {
            SastClient.throwScanError(lastStatus);
        }
    }

    /**
     * This method retrieves post scan action Id from name and returns ID
     * @param postScanActionName - Post scan action Name
     * @returns  - Post scan action ID
     */
     async getScanPostActionIdfromName(postScanActionName: string)
     {
         
        this.log.info('Getting post action scan Id for post scan action : ' + postScanActionName);

        try{
            const customTasks =  await this.httpClient.getRequest('customTasks/name/' + postScanActionName) as any[];
            if(customTasks){
                const foundCustomTask = customTasks.find(customTask => customTask.name === postScanActionName );
                if(foundCustomTask){
                    this.log.debug(`Resolved post scan action ID: ${foundCustomTask.id}`);
                    return foundCustomTask.id;
                } else {
                    this.log.error(`Could not resolve post scan action ID from name: ${postScanActionName}`);
                }
            }
        } catch (e) {
            if (e.status == 404) {
                this.log.error('Post Scan Action name API is not supported.');
            }else{
                this.log.error(`Could not resolve post scan action ID from name: ${postScanActionName}`);
            }
        }
        
     }

     /**
      * This method checks if any scan is in progress for a project
      * @param projectId  - Project ID for which scans are retrieved
      * @returns 
      */
     async checkQueueScansInProgress(projectId : number)
     {
        this.log.info('Checking if any in progress project scan in queue.');
        const settingsResponse = await this.httpClient.getRequest('sast/scansQueue?projectId=' + projectId);
        if(settingsResponse)
        {
            for (const scanStatus of settingsResponse) 
           {
                if (SastClient.isInProgress(scanStatus)) {
                    return true;
                } else {
                    return false;
                }
            }
        }else{
            return false;
        }
     }
 
    private static throwScanError(status: ScanStatus) {
        let details = '';
        if (status) {
            const stage = status.stage ? status.stage.value : '';
            details = `Status [${stage}]: ${status.stageDetails}`;
        }
        throw Error(`SAST scan cannot be completed. ${details}`);
    }

    private checkIfScanFinished = () => {
        return new Promise<ScanStatus>((resolve, reject) => {
            this.httpClient.getRequest(`sast/scansQueue/${this.scanId}`)
                .then((scanStatus: ScanStatus) => {
                    if (SastClient.isInProgress(scanStatus)) {
                        reject(scanStatus);
                    } else {
                        resolve(scanStatus);
                    }
                });
        });
    };

    private logWaitingProgress = (scanStatus: ScanStatus) => {
        const elapsed = this.stopwatch.getElapsedString();
        const stage = scanStatus && scanStatus.stage ? scanStatus.stage.value : 'n/a';
        this.log.info(`Waiting for SAST scan results. Elapsed time: ${elapsed}. ${scanStatus.totalPercent}% processed. Status: ${stage}.`);
    };

    private static isFinishedSuccessfully(status: ScanStatus) {
        return status && status.stage &&
            (status.stage.value === ScanStage.Finished ||
                status.stageDetails === SastClient.SCAN_COMPLETED_MESSAGE);
    }

    private static isInProgress(scanStatus: ScanStatus) {
        let result = false;
        if (scanStatus && scanStatus.stage) {
            const stage = scanStatus.stage.value;
            result =
                stage !== ScanStage.Finished &&
                stage !== ScanStage.Failed &&
                stage !== ScanStage.Canceled &&
                stage !== ScanStage.Deleted &&
                scanStatus.stageDetails !== SastClient.SCAN_COMPLETED_MESSAGE;
        }
        return result;
    }
}