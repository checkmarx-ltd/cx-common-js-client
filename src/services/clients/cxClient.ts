import { ProxyConfig, ScanConfig } from "../..";
import { HttpClient } from "./httpClient";
import Zipper from "../zipper";
import { TaskSkippedError } from "../..";
import { ScanResults } from "../..";
import { SastClient } from "./sastClient";
import * as url from "url";
import { ArmClient } from "./armClient";
import { UpdateScanSettingsRequest } from "../../dto/api/updateScanSettingsRequest";
import { Logger } from "../logger";
import { ReportingClient } from "./reportingClient";
import { SastSummaryEvaluator } from "../sastSummaryEvaluator";
import { FilePathFilter } from "../filePathFilter";
import { TeamApiClient } from "./teamApiClient";
import { ScanSummary } from "../../dto/scanSummary";
import { ThresholdError } from "../../dto/thresholdError";
import { tmpNameSync } from "tmp";
import { ScaClient } from "./scaClient";
import { SastConfig } from '../../dto/sastConfig';
import { ScaConfig } from '../../dto/sca/scaConfig';
import { ScanWithSettingsResponse } from "../../dto/api/scanWithSettingsResponse";
const fs = require('fs');

/**
 * High-level CX API client that uses specialized clients internally.
 */
export class CxClient {
    private httpClient: HttpClient | any;
    private sastClient: SastClient | any;
    private armClient: ArmClient | any;
    private scaClient: ScaClient | any;

    private teamId = 0;
    private projectId = 0;
    private presetId = 0;
    private postScanActionId : string = "";
    private engineConfigurationId = 1;
    private isPolicyEnforcementSupported = false;
    private config: ScanConfig | any;
    private sastConfig: SastConfig | any;
    private scaConfig: ScaConfig | any;
    private proxyConfig: ProxyConfig | any;

    private swaggerLocation = 'help/swagger/docs/v1.1';
    private isNewProject: boolean = false;
    constructor(private readonly log: Logger) {
    }

    async scan(config: ScanConfig, httpClient?: HttpClient): Promise<ScanResults> {
        this.config = config;
        this.sastConfig = config.sastConfig;
        this.scaConfig = config.scaConfig;
        this.proxyConfig = config.proxyConfig;
        let result: ScanResults = new ScanResults();
        result.syncMode = this.config.isSyncMode;

        if (config.enableSastScan) {
            result.updateSastDefaultResults(this.sastConfig);
            this.log.info('Initializing Cx client');
            await this.initClients(httpClient);
            await this.initDynamicFields();

            if(this.sastConfig.avoidDuplicateProjectScans)
            {
              const scanInProgress = await this.sastClient.checkQueueScansInProgress(this.projectId);
              if(scanInProgress){
                throw Error("Project scan is already in progress.");
              }
            }   
            result = await this.createSASTScan(result);

            if (this.config.isSyncMode) {
                result = await this.getSASTResults(result);
            } else {
                this.log.info('Running in Asynchronous mode. Not waiting for scan to finish.');
            }
        }

        if (config.enableDependencyScan) {
            if (config.enableSastScan) {
                this.log.info("************************************************************");
            }

            this.log.info("Initializing CxSCA client");
            await this.initScaClient();
            await this.scaClient.createScan();

            if (this.config.isSyncMode) {
                await this.scaClient.waitForScanResults(result);
            } else {
                this.scaClient.getLatestScanResultsLink();
                this.log.info('Running in Asynchronous mode. Not waiting for scan to finish.');
            }
        }

        return result;
    }

    private async initClients(httpClient?: HttpClient) {
        const baseUrl = url.resolve(this.sastConfig.serverUrl, 'CxRestAPI/');

        if (!httpClient) {
            if (this.config.enableProxy && this.config.proxyConfig && (this.proxyConfig.proxyHost != '' || this.proxyConfig.proxyUrl != '')) {
                this.httpClient = new HttpClient(baseUrl, this.config.cxOrigin, this.config.cxOriginUrl,this.log, this.proxyConfig, this.sastConfig.cacert_chainFilePath);
            } else {
                this.httpClient = new HttpClient(baseUrl, this.config.cxOrigin, this.config.cxOriginUrl,this.log, undefined, this.sastConfig.cacert_chainFilePath);
            }
            await this.httpClient.getPacProxyResolve();
            await this.httpClient.login(this.sastConfig.username, this.sastConfig.password);
        }
        else {
            this.httpClient = httpClient;
        }

        this.sastClient = new SastClient(this.sastConfig, this.httpClient, this.log);

        this.armClient = new ArmClient(this.httpClient, this.log);
        if (this.sastConfig.enablePolicyViolations) {
            await this.armClient.init();
        }
    }

    private async initScaClient() {
        let scaHttpClient: HttpClient;
        if (this.config.enableProxy && this.config.proxyConfig && (this.proxyConfig.proxyHost != '' || this.proxyConfig.proxyUrl != '')) {
            scaHttpClient = new HttpClient(this.scaConfig.apiUrl, this.config.cxOrigin, this.config.cxOriginUrl,this.log, this.proxyConfig, this.scaConfig.cacert_chainFilePath);
        } else {
            scaHttpClient = new HttpClient(this.scaConfig.apiUrl, this.config.cxOrigin, this.config.cxOriginUrl,this.log, undefined, this.scaConfig.cacert_chainFilePath);
        }

        this.scaClient = new ScaClient(this.scaConfig, this.config.sourceLocation, scaHttpClient, this.log, this.config);
        await this.scaClient.httpClient.getPacProxyResolve();
        await this.scaClient.scaLogin(this.scaConfig);
        await this.scaClient.resolveProject(this.config.projectName);
    }

    private async createSASTScan(scanResult: ScanResults): Promise<ScanResults> {
        this.log.info('-----------------------------------Create CxSAST Scan:-----------------------------------');
        const runScanWithSettings: boolean = await this.isScanWithSettingsSupported() as boolean;
        if (runScanWithSettings) {
            this.log.debug('start scan with scanWithSettings');
            const scanResponse: ScanWithSettingsResponse = await this.scanWithSetting() as ScanWithSettingsResponse;
            this.sastClient.setScanId(scanResponse.id);
            scanResult.scanId = scanResponse.id;
        } else {
            this.log.debug('start scan with legacy approach');
            await this.updateScanSettings();
            await this.uploadSourceCode();
            scanResult.scanId = await this.sastClient.createScan(this.projectId);
        }
        const projectStateUrl = url.resolve(this.sastConfig.serverUrl, `CxWebClient/portal#/projectState/${this.projectId}/Summary`);
        this.log.info(`SAST scan created successfully. CxLink to project state: ${projectStateUrl}`);
        this.log.info('Scan id ' + scanResult.scanId);

        return scanResult;
    }

    async isScanWithSettingsSupported(): Promise<boolean> {
        try {
            const swaggerResponse = await this.httpClient.getRequest(this.swaggerLocation, { suppressWarnings: true })
            return swaggerResponse.paths.hasOwnProperty('/sast/scanWithSettings');
        } catch (e) {
            return false;
        }
    }

    private async getSASTResults(result: ScanResults): Promise<ScanResults> {
        this.log.info('------------------------------------Get CxSAST Results:----------------------------------');
        this.log.info('Retrieving SAST scan results');

        await this.sastClient.waitForScanToFinish();

        await this.addStatisticsToScanResults(result);
        await this.addPolicyViolationsToScanResults(result);

        this.printStatistics(result);

        await this.addDetailedReportToScanResults(result);

        const evaluator = new SastSummaryEvaluator(this.sastConfig, this.isPolicyEnforcementSupported);
        const summary = evaluator.getScanSummary(result);

        this.logPolicyCheckSummary(summary.policyCheck);

        if (summary.hasErrors()) {
            result.buildFailed = true;
            this.logBuildFailure(summary);
        }

        return result;
    }

    private async getOrCreateProject(): Promise<number> {
        let projectId = await this.getCurrentProjectId();
        if (projectId) {
            this.log.debug(`Resolved project ID: ${projectId}`);
            this.isNewProject = false;
        } else {
            this.log.info('Project not found, creating a new one.');
            this.isNewProject = true;
            if (this.sastConfig.denyProject) {
                throw Error(
                    `Creation of the new project [${this.config.projectName}] is not authorized. Please use an existing project.` +
                    " You can enable the creation of new projects by disabling the Deny new Checkmarx projects creation checkbox in the Checkmarx plugin global settings.");
            }

            projectId = await this.createNewProject();
            this.log.debug(`Project created. ID: ${projectId}`);
        }

        return projectId;
    }

    private async scanWithSetting(): Promise<ScanWithSettingsResponse> {
        const tempFilename = await this.zipContent();
        this.log.info(`Uploading the zipped source code.`);
        var apiVersionHeader = {};
        let versionInfo = await this.getVersionInfo();
        let version = versionInfo.version;
        if(version.includes('9.4')){
            apiVersionHeader = {'Content-type' : 'application/json;v=1.2'};
        }
            const scanResponse: ScanWithSettingsResponse = await this.httpClient.postMultipartRequest('sast/scanWithSettings',
            {
                projectId: this.projectId,
                overrideProjectSetting: this.isNewProject,
                isIncremental: this.sastConfig.isIncremental,
                isPublic: this.sastConfig.isPublic,
                forceScan: this.sastConfig.forceScan,
                presetId: this.presetId,
                comment: this.sastConfig.comment,
                customFields: this.sastConfig.customFields,
                engineConfigurationId:this.engineConfigurationId,
                postScanActionId:this.postScanActionId
            },
            { zippedSource: tempFilename },apiVersionHeader);
            await this.deleteZip(tempFilename);
            return scanResponse;
    }

    private async uploadSourceCode(): Promise<void> {
        const tempFilename = await this.zipContent();
        this.log.info(`Uploading the zipped source code.`);
        const urlPath = `projects/${this.projectId}/sourceCode/attachments`;
        await this.httpClient.postMultipartRequest(urlPath,
            { id: this.projectId },
            { zippedSource: tempFilename });
        await this.deleteZip(tempFilename);
    }

    private async deleteZip(fileToDelete:string){
        if(fs.existsSync(fileToDelete)){
            fs.unlinkSync(fileToDelete);
        }else{
            this.log.error("File from $ {fileToDelete} can not deleted. ");
        }

    }
    private async zipContent() {
        const tempFilename = tmpNameSync({ prefix: 'cxsrc-', postfix: '.zip' });
        this.log.debug(`Zipping source code at ${this.config.sourceLocation} into file ${tempFilename}`);
        let filter: FilePathFilter;
        filter = new FilePathFilter(this.sastConfig.fileExtension, this.sastConfig.folderExclusion);
        const zipper = new Zipper(this.log, [filter]);
        const zipResult = await zipper.zipDirectory(this.config.sourceLocation, tempFilename);
        if (zipResult.fileCount === 0) {
            throw new TaskSkippedError('Zip file is empty: no source to scan');
        }
        return tempFilename;
    }

    private async getCurrentProjectId(): Promise<number> {
        this.log.info(`Resolving project: ${this.config.projectName}`);
        let result;
        const encodedName = encodeURIComponent(this.config.projectName);
        const path = `projects?projectname=${encodedName}&teamid=${this.teamId}`;
        try {
            const projects = await this.httpClient.getRequest(path, { suppressWarnings: true });
            if (projects && projects.length) {
                result = projects[0].id;
            }
        } catch (err) {
            const isExpectedError = err.response && err.response.notFound;
            if (!isExpectedError) {
                throw err;
            }
        }
        return result;
    }

    private async createNewProject(): Promise<number> {
        const request = {
            name: this.config.projectName,
            owningTeam: this.teamId,
            isPublic: this.sastConfig.isPublic
        };

        const newProject = await this.httpClient.postRequest('projects', request);
        this.log.debug(`Created new project, ID: ${newProject.id}`);

        return newProject.id;
    }

    private async updateScanSettings() {
        const settingsResponse = await this.sastClient.getScanSettings(this.projectId);

        const configurationId = settingsResponse &&
            settingsResponse.engineConfiguration &&
            settingsResponse.engineConfiguration.id;

        const request: UpdateScanSettingsRequest = {
            projectId: this.projectId,
            presetId: this.presetId,
            engineConfigurationId: configurationId || 0
        };

        await this.sastClient.updateScanSettings(request);
    }

    private async addPolicyViolationsToScanResults(result: ScanResults) {
        if (!this.sastConfig.enablePolicyViolations) {
            return;
        }
        if (!this.isPolicyEnforcementSupported) {
            this.log.warning('Policy enforcement is not supported by the current Checkmarx server version.');
            return;
        }

        await this.armClient.waitForArmToFinish(this.projectId);
        const projectViolations = await this.armClient.getProjectViolations(this.projectId, 'SAST');
        for (const policy of projectViolations) {
            result.sastPolicies.push(policy.policyName);
            for (const violation of policy.violations) {
                result.sastViolations.push({
                    libraryName: violation.source,
                    policyName: policy.policyName,
                    ruleName: violation.ruleName,
                    detectionDate: (new Date(violation.firstDetectionDateByArm)).toLocaleDateString()
                });
            }
        }
    }

    private async addStatisticsToScanResults(result: ScanResults) {
        const statistics = await this.sastClient.getScanStatistics(result.scanId);
        result.highResults = statistics.highSeverity;
        result.mediumResults = statistics.mediumSeverity;
        result.lowResults = statistics.lowSeverity;
        result.infoResults = statistics.infoSeverity;

        const sastScanPath = `CxWebClient/ViewerMain.aspx?scanId=${result.scanId}&ProjectID=${this.projectId}`;
        result.sastScanResultsLink = url.resolve(this.sastConfig.serverUrl, sastScanPath);

        const sastProjectLink = `CxWebClient/portal#/projectState/${this.projectId}/Summary`;
        result.sastSummaryResultsLink = url.resolve(this.sastConfig.serverUrl, sastProjectLink);

        result.sastResultsReady = true;
    }

    private async addDetailedReportToScanResults(result: ScanResults) {
        const client = new ReportingClient(this.httpClient, this.log);
        let reportXml;

        for (let i = 1; i < 25; i++) {
            try {
                reportXml = await client.generateReport(result.scanId, this.config.cxOrigin);
                if (typeof reportXml !== 'undefined' && reportXml !== null) {
                    break;
                }
                await this.delay(15555);
            } catch (e) {
                this.log.warning('Failed to generate report on attempt number: ' + i);
                await this.delay(15555);
            }
        }

        const doc = reportXml.CxXMLResults;
        result.scanStart = doc.$.ScanStart;
        result.scanTime = doc.$.ScanTime;
        result.locScanned = doc.$.LinesOfCodeScanned;
        result.filesScanned = doc.$.FilesScanned;
        result.queryList = CxClient.toJsonQueries(doc.Query);

        // TODO: PowerShell code also adds properties such as newHighCount, but they are not used in the UI.
    }


    private delay(ms: number) {
        this.log.debug("Activating delay for: " + ms);
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private printStatistics(result: ScanResults) {
        this.log.info(`----------------------------Checkmarx Scan Results(CxSAST):-------------------------------
High severity results: ${result.highResults}
Medium severity results: ${result.mediumResults}
Low severity results: ${result.lowResults}
Info severity results: ${result.infoResults}

Scan results location:  ${result.sastScanResultsLink}
------------------------------------------------------------------------------------------
`);
    }

    private static toJsonQueries(queries: any[] | undefined) {
        const SEPARATOR = ';';

        // queries can be undefined if no vulnerabilities were found.
        return (queries || []).map(query =>
            JSON.stringify({
                name: query.$.name,
                severity: query.$.Severity,
                resultLength: query.Result.length
            })
        ).join(SEPARATOR);
    }

    private async getVersionInfo() {
        let versionInfo = null;
        try {
            versionInfo = await this.httpClient.getRequest('system/version', { suppressWarnings: true });
            this.log.info(`Checkmarx server version [${versionInfo.version}]. Hotfix [${versionInfo.hotFix}].`);
        } catch (e) {
            versionInfo = 'under9';
            this.log.info('Checkmarx server version is lower than 9.0.');
        }
        return versionInfo;
    }

    private async initDynamicFields() {
        const versionInfo = await this.getVersionInfo();
        this.isPolicyEnforcementSupported = !!versionInfo;

        if (this.sastConfig.presetId) {
            this.presetId = this.sastConfig.presetId;
        }
        else {
            this.presetId = await this.sastClient.getPresetIdByName(this.sastConfig.presetName);
        }

        if (this.sastConfig.teamId) {
            this.teamId = this.sastConfig.teamId;
        }
        else {
            const teamApiClient = new TeamApiClient(this.httpClient, this.log);
            this.teamId = await teamApiClient.getTeamIdByName(this.sastConfig.teamName);
        }

        
        let postScanActionName = this.sastConfig.postScanActionName;
        if(postScanActionName && postScanActionName.length > 0){
            this.postScanActionId = await this.sastClient.getScanPostActionIdfromName(postScanActionName);
            this.log.info("Post Scan Action ID : "+this.postScanActionId );
            if(!this.postScanActionId)
            {
                this.postScanActionId  = "";
            }
        }
            
        if(this.sastConfig.engineConfigurationId)
        {
            this.engineConfigurationId = this.sastConfig.engineConfigurationId;
        }else{
            this.log.info("Engine Configuration ID is not configured, Using default.");
        }

        if (this.config.projectId) {
            this.projectId = this.config.projectId;
        }
        else {
            this.projectId = await this.getOrCreateProject();
        }
    }

    
    private logBuildFailure(failure: ScanSummary) {
        this.log.error(
            `********************************************
The Build Failed for the Following Reasons:
********************************************`);
        this.logPolicyCheckError(failure.policyCheck);
        this.logThresholdErrors(failure.thresholdErrors);
    }

    private logPolicyCheckSummary(policyCheck: { wasPerformed: boolean; violatedPolicyNames: string[] }) {
        if (policyCheck.wasPerformed) {
            this.log.info(
                `-----------------------------------------------------------------------------------------
Policy Management:
--------------------`);
            if (policyCheck.violatedPolicyNames.length) {
                this.log.info('Project policy status: violated');

                const names = policyCheck.violatedPolicyNames.join(', ');
                this.log.info(`SAST violated policies names: ${names}`);
            } else {
                this.log.info('Project policy status: compliant');
            }
            this.log.info('-----------------------------------------------------------------------------------------');
        }
    }

    private logThresholdErrors(thresholdErrors: ThresholdError[]) {
        if (thresholdErrors.length) {
            this.log.error('Exceeded CxSAST Vulnerability Threshold.');
            for (const error of thresholdErrors) {
                this.log.error(`SAST ${error.severity} severity results are above threshold. Results: ${error.actualViolationCount}. Threshold: ${error.threshold}`);
            }
        }
    }

    private logPolicyCheckError(policyCheck: { violatedPolicyNames: string[] }) {
        if (policyCheck.violatedPolicyNames.length) {
            this.log.error('Project policy status: violated');
        }
    }
}
