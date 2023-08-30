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
import { NewVulnerabilitiesThresholdError } from "../../dto/newVulnerabilitiesThresholdError";
import { CustomFields } from "../../dto/api/customFields";
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
            //add report generation function here.
            if(this.config.sastConfig.generatePDFReport){
                await this.generatePDFReport(result);
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

    private async generatePDFReport(scanResult: ScanResults){
        this.log.info("Generating PDF Report");
        const client = new ReportingClient(this.httpClient, this.log, "PDF");
        let reportPDF;
        for (let i = 1; i < 25; i++) {
            try {
                reportPDF = await client.generateReport(scanResult.scanId, this.config.cxOrigin);
                if (typeof reportPDF !== 'undefined' && reportPDF !== null) {
                    this.log.info("PDF report fetched successfully");
                    scanResult.generatePDFReport = true;
                    scanResult.reportPDF = reportPDF;
                    break;
                }
                await this.delay(15555);
            }
            catch (e) {
                this.log.warning('Failed to generate report on attempt number: ' + i);
                await this.delay(15555);
            }
        }
    }
    private async initClients(httpClient?: HttpClient) {
        const baseUrl = url.resolve(this.sastConfig.serverUrl, 'CxRestAPI/');
        let sastProxyConfig = JSON.parse(JSON.stringify(this.config.proxyConfig));

        if (!httpClient) 
        {
            if (this.config.enableProxy && this.config.proxyConfig && (this.proxyConfig.proxyHost != '' || this.proxyConfig.proxyUrl != '' || this.proxyConfig.sastProxyUrl != '')) 
            {
                sastProxyConfig.proxyUrl = this.proxyConfig.sastProxyUrl != '' ? this.proxyConfig.sastProxyUrl : this.proxyConfig.proxyUrl;
                sastProxyConfig.sastProxyUrl = '';
                sastProxyConfig.scaProxyUrl = '';
                this.httpClient = new HttpClient(baseUrl, this.config.cxOrigin, this.config.cxOriginUrl, this.log, sastProxyConfig, this.sastConfig.cacert_chainFilePath);
            }
            else 
            {
                this.httpClient = new HttpClient(baseUrl, this.config.cxOrigin, this.config.cxOriginUrl, this.log, undefined, this.sastConfig.cacert_chainFilePath);
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
        let scaProxyConfig = JSON.parse(JSON.stringify(this.config.proxyConfig));

        if (this.config.enableProxy && this.config.proxyConfig && (this.proxyConfig.proxyHost != '' || this.proxyConfig.proxyUrl != '' || this.proxyConfig.scaProxyUrl != '')) 
        {
            scaProxyConfig.proxyUrl = this.proxyConfig.scaProxyUrl != '' ? this.proxyConfig.scaProxyUrl : this.proxyConfig.proxyUrl;
            scaProxyConfig.sastProxyUrl = '';
            scaProxyConfig.scaProxyUrl = '';
            this.log.info("Overriten URL "+this.config.proxyConfig.sastProxyUrl);
            scaHttpClient = new HttpClient(this.scaConfig.apiUrl, this.config.cxOrigin, this.config.cxOriginUrl,this.log, scaProxyConfig, this.scaConfig.cacert_chainFilePath);
        } 
        else 
        {
            scaHttpClient = new HttpClient(this.scaConfig.apiUrl, this.config.cxOrigin, this.config.cxOriginUrl,this.log, undefined, this.scaConfig.cacert_chainFilePath);
        }
        await scaHttpClient.getPacProxyResolve();
        this.scaClient = new ScaClient(this.scaConfig, this.config.sourceLocation, scaHttpClient, this.log,scaProxyConfig, this.config);
        
       
        await this.scaClient.scaLogin(this.scaConfig);
        await this.scaClient.resolveProject(this.config.projectName);
    }

    private async createSASTScan(scanResult: ScanResults): Promise<ScanResults> {
        this.log.info('-----------------------------------Create CxSAST Scan:-----------------------------------');
        const runScanWithSettings: boolean = await this.isScanWithSettingsSupported() as boolean;
        if(this.sastConfig.projectCustomFields){
            await this.updateProjectCustomFields();
        }
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

    async updateProjectCustomFields(): Promise<void> {
        this.log.info("Updating Project Custom Fields.");
        let projectId = this.projectId;
        let path = `projects/${projectId}`;

        //reading project custom fields entered by user on UI.
        const projectCustomFields = this.sastConfig.projectCustomFields.split(",");
        const projectCustomFieldsIds = new Array<string>(projectCustomFields.length);
        const projectCustomFieldsKeys = new Array<string>(projectCustomFields.length);
        const projectCustomFieldsValues = new Array<string>(projectCustomFields.length);
        for (let i = 0; i < projectCustomFields.length; i++) {
            projectCustomFieldsKeys[i] = projectCustomFields[i].split(":")[0];
            projectCustomFieldsValues[i] = projectCustomFields[i].split(":")[1];
        }

        //reading project custom fields stored in SAST Portal
        const fetchSASTProjectCustomFields = await this.httpClient.getRequest('customFields',{});
        for (let i = 0; i < projectCustomFieldsKeys.length; i++){
            for(let fetchSASTProjectCustomField of fetchSASTProjectCustomFields){
                if(projectCustomFieldsKeys[i] === fetchSASTProjectCustomField.name){
                    projectCustomFieldsIds[i] = fetchSASTProjectCustomField.id;
                }
            }
        }     

        let customField = {};
        let temp_customFields = [];

        let existingCustomFields = await this.getCustomFieldsProjectName();
        for(let i=0; i < existingCustomFields.length; i++)
        {
            let isIdExists = projectCustomFieldsIds.find(a=> a == existingCustomFields[i].id.toString()) != undefined;
            if(!isIdExists)
            {
                customField = {"id":parseInt(existingCustomFields[i].id.toString()),"value":existingCustomFields[i].value};
                temp_customFields.push(customField);
            }
        }

        customField = {};
        for (let i=0; i < projectCustomFieldsIds.length; i++ ) {
            if( isNaN( parseInt(projectCustomFieldsIds[i]) ) ){
                this.log.warning(`Could not update '${projectCustomFieldsKeys[i]}'. Custom Field does not exist.`);
            }
            else {
                customField = {"id":parseInt(projectCustomFieldsIds[i]),"value":projectCustomFieldsValues[i]};
                temp_customFields.push(customField);
            }
        }
              
        await this.httpClient.putRequest(path, {
            name: this.config.projectName,
            owningTeam: this.teamId,
            customFields: temp_customFields
        });
    }
    private async isPriorVersion(version: string, proirToVersion: string): Promise<boolean> {
        try {
            const value = version.split(".");
            var currentVersion = (value[0]) + "." + (value[1]);
            if (parseFloat(currentVersion) < parseFloat(proirToVersion)) {
                return true;
            }
            else {
                return false;
            }
        } catch (e: any) {
            return false;
        }
    }

    private async isScanWithSettingsSupported(): Promise<boolean> {
        try {
            let versionInfo = await this.getVersionInfo();
            let version = versionInfo.version;
            const isPriorVersionSupported: boolean = await this.isPriorVersion(version, '9.3');
            return !isPriorVersionSupported
            
        } catch (e) {
            return false;
        }
    }

    private async getSASTResults(result: ScanResults): Promise<ScanResults> {
        this.log.info('------------------------------------Get CxSAST Results:----------------------------------');
        this.log.info('Retrieving SAST scan results');

        await this.sastClient.waitForScanToFinish();

        await this.addStatisticsToScanResults(result); //setting sastconfig properties to result
        await this.addPolicyViolationsToScanResults(result);

        await this.addDetailedReportToScanResults(result); //setting newSeverities

        this.printStatistics(result);

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

    private async getCustomFieldsProjectName(): Promise<Array<CustomFields>> {
        let result;
        const encodedName = encodeURIComponent(this.config.projectName);
        const path = `projects?projectname=${encodedName}&teamid=${this.teamId}`;
        try {
            const projects = await this.httpClient.getRequest(path, { suppressWarnings: true });
            if (projects != null && projects != undefined && projects?.length) 
                result = projects[0].customFields;
        } catch (err) {
            const isExpectedError = err?.response && err.response?.notFound;
            if (!isExpectedError) {
                throw err;
            }
        }
        return result;
    }

    private async isScanLevelCustomFieldSupported(): Promise<boolean> {
        try {
            let versionInfo =await this.getVersionInfo();
            let version = versionInfo.version;
            const isScanLevelCustomField: boolean = await this.isPriorVersion(version, '9.4');
            return !isScanLevelCustomField
        } catch (e) {
            return false;
        }
    }

    private async scanWithSetting(): Promise<ScanWithSettingsResponse> {
        const tempFilename = await this.zipContent();
        this.log.info(`Uploading the zipped source code.`);
        let isOverrideProjectSettings = false;
        var apiVersionHeader = {};
        if (await this.isScanLevelCustomFieldSupported()) {
            apiVersionHeader = { 'Content-type': 'application/json;v=1.2' };
        }
        isOverrideProjectSettings = this.sastConfig.overrideProjectSettings || this.isNewProject;
        const scanResponse: ScanWithSettingsResponse = await this.httpClient.postMultipartRequest('sast/scanWithSettings',
        {
            projectId: this.projectId,
            overrideProjectSetting: isOverrideProjectSettings,
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
        result.queryList = CxClient.toJsonQueries(result, doc.Query);

        //Find if there are any new vulnerabilities
        if(this.sastConfig.failBuildForNewVulnerabilitiesEnabled)
            CxClient.getNewVulnerabilityCounts(result, doc.Query);
        
        // TODO: PowerShell code also adds properties such as newHighCount, but they are not used in the UI.
    }


    private delay(ms: number) {
        this.log.debug("Activating delay for: " + ms);
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private printStatistics(result: ScanResults) {
        const newHigh = (result.newHighCount > 0  && result.failBuildForNewVulnerabilitiesEnabled) ? " (" + result.newHighCount + " new)" : "";
        const newMedium = (result.newMediumCount > 0 && result.failBuildForNewVulnerabilitiesEnabled) ? " (" + result.newMediumCount + " new)" : "";
        const newLow = (result.newLowCount > 0 && result.failBuildForNewVulnerabilitiesEnabled) ? " (" + result.newLowCount + " new)" : "";
        const newInfo = (result.newInfoCount > 0 && result.failBuildForNewVulnerabilitiesEnabled) ? " (" + result.newInfoCount + " new)" : "";
        this.log.info(`----------------------------Checkmarx Scan Results(CxSAST):-------------------------------
High severity results: ${result.highResults}${newHigh}
Medium severity results: ${result.mediumResults}${newMedium}
Low severity results: ${result.lowResults}${newLow}
Info severity results: ${result.infoResults}${newInfo}

Scan results location:  ${result.sastScanResultsLink}
------------------------------------------------------------------------------------------
`);
    }

    private static toJsonQueries(scanResult: ScanResults, queries: any[]) {
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

    private static getNewVulnerabilityCounts(scanResult: ScanResults, queries: any[]) {
        var results, severity;
        if(queries == undefined || queries.length == 0)
            return;

        for(let query of queries) 
        {
            results = query.Result;
            for(let result of results) {
                if(result.$.FalsePositive === "False" && result.$.Status === "New"){
                    severity = result.$.Severity;
                    switch(severity){
                        case "High":
                            scanResult.newHighCount++;
                            break;
                        case "Medium":
                            scanResult.newMediumCount++;
                            break;
                        case "Low":
                            scanResult.newLowCount++;
                            break;
                        case "Information":
                            scanResult.newInfoCount++;
                            break;
                    }
                }
            }
        }
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
            if(this.sastConfig.presetName=='Project Default'){
                this.presetId = 0;
            }
            else{
            this.presetId = await this.sastClient.getPresetIdByName(this.sastConfig.presetName);
            }
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

//add for new vulnerabilities    
    private logBuildFailure(failure: ScanSummary) {
        this.log.error(
            `********************************************
The Build Failed for the Following Reasons:
********************************************`);
        this.logPolicyCheckError(failure.policyCheck);
        this.logThresholdErrors(failure.thresholdErrors);
        this.logNewVulnerabilitiesThresholdErrors(failure.newVulnerabilitiesThresholdErrors);
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

    private logNewVulnerabilitiesThresholdErrors(newVulnerabilitiesThresholdErrors: NewVulnerabilitiesThresholdError[]){
        if(newVulnerabilitiesThresholdErrors.length){
            this.log.error('Scan Failed as new SAST vulnerabilities were found');
            for (const error of newVulnerabilitiesThresholdErrors) {
                this.log.error(`${error.severityCount} new SAST ${error.severity} severities were found.`);
            }
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
