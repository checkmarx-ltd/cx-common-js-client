import { HttpClient } from './clients/httpClient';
import { Waiter } from './waiter';
import { Logger } from './logger';
import { PollingSettings } from '../dto/pollingSettings';
import { ScanInfoResponse } from '../dto/sca/scanInfoResponse';
import { Stopwatch } from './stopwatch';
import { ScanStatus } from '../dto/sca/scanStatus';
import { ScaConfig } from '../dto/sca/scaConfig';

export class SCAWaiter {
    private static readonly POLLING_INTERVAL_IN_SECONDS = 5;
    public status = '';
    constructor(private readonly config: ScaConfig,
        private readonly scanId: string,
        private readonly httpClient: HttpClient,
        private readonly stopwatch: Stopwatch,
        private readonly log: Logger) {
    }

    async waitForScanToFinish() {
        this.log.info('Waiting for CxSCA scan to finish.');

        const polling: PollingSettings = {
            masterTimeoutMinutes: this.config.scaScanTimeoutInMinutes,
            intervalSeconds: SCAWaiter.POLLING_INTERVAL_IN_SECONDS
        };

        let lastStatus;
        const waiter = new Waiter();
        try {
            lastStatus = await waiter.waitForTaskToFinish(
                this.checkIfScanFinished,
                this.logWaitingProgress,
                polling);
        } catch (err) {
            this.status = ScanStatus.FAILED;
            throw Error(`Failed to perform CxSCA scan. The scan has been automatically aborted: reached the specified timeout (${polling.masterTimeoutMinutes} minutes).`);
        }

        this.handleScanStatus(lastStatus);
    }

    private handleScanStatus(response: ScanInfoResponse) {
        if (response && response.status) {
            if (response.status === ScanStatus.COMPLETED) {
                this.log.info('CxSCA scan finished successfully.');
            }
            else {
                throw Error(`Scan status is ${response.status}, aborting.`);
            }
        }
    }

    private checkIfScanFinished = () => {
        return new Promise<ScanInfoResponse>((resolve, reject) => {
            this.httpClient.getRequest(`/api/scans/${this.scanId}`)
                .then((response: ScanInfoResponse) => {
                    if (this.status != ScanStatus.FAILED) {
                    if (SCAWaiter.isInProgress(response)) {
                        reject(response);
                    } else {
                        resolve(response);
                    }
                }
                }).catch(err => {
                    let response = new ScanInfoResponse();
                    response.id = "Failed";
                    response.status = ScanStatus.FAILED;
                    this.log.error("Error occured while checking scan status.\n" + err);
                    resolve(response);
                });
        });
    }

    private logWaitingProgress = (response: ScanInfoResponse) => {
        const elapsed = this.stopwatch.getElapsedString();
        const status = response && response.status ? response.status : 'n/a';
        this.log.info(`Waiting for CxSCA scan results. Elapsed time: ${elapsed}. Status: ${status}.`);
    };

    private static isInProgress(response: ScanInfoResponse): boolean {
        if (response && response.status === ScanStatus.RUNNING) {
            return true;
        }
        return false;
    }
}