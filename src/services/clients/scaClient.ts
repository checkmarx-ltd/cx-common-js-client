import { Logger, PollingSettings, SastConfig, ScaConfig, ScanConfig, Waiter } from "../..";
import { HttpClient } from "./httpClient";
import { Stopwatch } from "../stopwatch";
import { ScaLoginSettings } from "../../dto/sca/scaLoginSettings";
import { SCAResults } from "../../dto/sca/scaResults";
import { ScaSummaryResults } from "../../dto/sca/report/scaSummaryResults";
import { Project } from "../../dto/sca/project";
import { ClientType } from '../../dto/sca/clientType';
import { ScaResolvingConfiguration } from '../../dto/sca/scaResolvingConfiguration';
import { Finding } from "../../dto/sca/report/finding";
import { Package } from "../../dto/sca/report/package";
import { ScanResults } from '../../dto/scanResults';
import { SCAWaiter } from '../scaWaiter';
import { SourceLocationType } from '../../dto/sca/sourceLocationType';
import { file, tmpName,tmpNameSync } from "tmp";
import { FilePathFilter } from "../filePathFilter";
import Zipper from "../zipper";
import FileIO from '../fileIO';
import { TaskSkippedError } from "../../dto/taskSkippedError";
import { RemoteRepositoryInfo } from '../../dto/sca/remoteRepositoryInfo';
import { ScaReportResults } from '../../dto/sca/scaReportResults';
import * as url from "url";
import * as os from 'os';
import { ScaSummaryEvaluator } from "../scaSummaryEvaluator";
import { ScanSummary } from "../../dto/scanSummary";
import { ScaFingerprintCollector } from '../../dto/sca/scaFingerprintCollector';
import * as path from "path";
import ClientTypeResolver from "../clientTypeResolver";
import { ScanProvider } from "../../dto/api/scanProvider";
import { PolicyViolationGroup } from "../../dto/api/policyViolationGroup";
import { ArmStatus } from "../../dto/api/armStatus";
import { report } from "superagent";
import { PolicyEvaluation } from "../../dto/api/PolicyEvaluation";
import { PolicyAction } from "../../dto/api/PolicyAction";
import { PolicyRule } from "../../dto/api/PolicyRule";
import { ScanConfiguration } from "../../dto/api/ScanConfiguration";
import { ScanConfigValue } from "../../dto/api/ScanConfigValue";
import { ScaScanConfigValue } from "../../dto/api/ScaScanConfigValue";
import { config } from "process";
import { SastClient } from "./sastClient";
const fs = require('fs');
;/**
 * SCA - Software Composition Analysis - is the successor of OSA.
 */
export class ScaClient {
    public static readonly TENANT_HEADER_NAME: string = "Account-Name";
    public static readonly AUTHENTICATION: string = "identity/connect/token";

    private static readonly RISK_MANAGEMENT_API: string = "/risk-management/";
    private static readonly PROJECTS: string = ScaClient.RISK_MANAGEMENT_API + "projects";
    private static readonly SUMMARY_REPORT: string = ScaClient.RISK_MANAGEMENT_API + "riskReports/%s/summary";
    private static readonly REPORT_ID: string = ScaClient.RISK_MANAGEMENT_API + "scans/%s/riskReportId";

    private static readonly ZIP_UPLOAD: string = "/api/uploads";
    private static readonly SCA_CONFIG_FOLDER_NAME: string = ".cxsca.configurations";

    private static readonly CREATE_SCAN: string = "/api/scans";
    private static readonly GET_SCAN: string = "/api/scans/%s";
    private static readonly WEB_REPORT: string = "/#/projects/%s/reports/%s";


    private static readonly SETTINGS_API = '/settings/';
    private static readonly RESOLVING_CONFIGURATION_API = (projectId: string) => ScaClient.SETTINGS_API + `projects/${projectId}/resolving-configuration`;

    private static FINGERPRINT_FILE_NAME = '.cxsca.sig';
    private static DEFAULT_FINGERPRINT_FILENAME = 'CxSCAFingerprints.json';
    private projectId: string = '';
    private scanId: string = '';

    private readonly stopwatch = new Stopwatch();
    private static readonly pollingSettings: PollingSettings = {
        intervalSeconds: 10,
        masterTimeoutMinutes: 20
    };
    constructor(private readonly config: ScaConfig,
        private readonly sourceLocation: string,
        private readonly httpClient: HttpClient,
        private readonly log: Logger,
        private readonly scanConfig: ScanConfig) {
    }

    private async resolveScaLoginSettings(scaConfig: ScaConfig): Promise<ScaLoginSettings> {
        const settings: ScaLoginSettings = new ScaLoginSettings();

        let acUrl: string = scaConfig.accessControlUrl;

        settings.apiUrl = scaConfig.apiUrl;
        settings.accessControlBaseUrl = acUrl;
        settings.username = scaConfig.username;
        settings.password = scaConfig.password;
        settings.tenant = scaConfig.tenant;

        const clientType: ClientType = await ClientTypeResolver.determineClientType(acUrl);
        settings.clientTypeForPasswordAuth = clientType;

        return settings;
    }

    public async scaLogin(scaConfig: ScaConfig) {
        this.log.info("Logging into CxSCA.");
        const settings: ScaLoginSettings = await this.resolveScaLoginSettings(scaConfig);
        await this.httpClient.scaLogin(settings);
    }

    public async resolveProject(projectName: string) {
        this.log.info("Resolving project by name: " + projectName);
        await this.resolveProjectId(projectName);
        if (!this.projectId) {
            this.log.info("Project not found, creating a new one.");
            this.projectId = await this.createProject(projectName);
            this.log.info("Created a project with ID: " + this.projectId);
        }
        else {
            this.log.info("Project already exists with ID: " + this.projectId);
        }
    }

    private async resolveProjectId(projectName: string) {
        if (!projectName || projectName === '') {
            throw Error("Non-empty project name must be provided.");
        }

        this.log.info('Resolve Project byName : ' + ScaClient.PROJECTS + '?name=' + projectName);
        try {
            const project: Project = await this.httpClient.getRequest(ScaClient.PROJECTS + '?name=' + projectName) as Project;
            if (project)
                this.projectId = project.id;
        } catch (err) {
            if (err.status !== 404)
                this.log.error('Internal error,status :' + err.status)
        }
    }

    private async getProjectIdByName(projectName: string) {
        if (!projectName || projectName === '') {
            throw Error("Non-empty project name must be provided.");
        }

        const allProjects: Project[] = await this.getAllProjects();
        for (const project of allProjects) {
            if (project.name.match(projectName)) {
                this.projectId = project.id;
                break;
            }
        }
    }

    private async getAllProjects(): Promise<Project[]> {
        return await this.httpClient.getRequest(ScaClient.PROJECTS) as Project[];
    }

    private async createProject(projectName: string): Promise<any> {
        const teamName = this.config.scaSastTeam;
        if(!teamName || teamName=='/'){
            this.log.error("Team name for Cx SCA is not specified. ");
        }
        let teamNameArray: Array<string|undefined> = [teamName];
            const request = {
            name: projectName,
            AssignedTeams:teamNameArray
        }; 
        const newProject = await this.httpClient.postRequest(ScaClient.PROJECTS, request);
        return newProject.id;
    }

    public async createScan() {
        this.log.info("----------------------------------- Creating CxSCA Scan ------------------------------------");
        try {
            const locationType: SourceLocationType = this.config.sourceLocationType;
            let response: any;
            if (locationType === SourceLocationType.REMOTE_REPOSITORY) {
                response = await this.submitSourceFromRemoteRepo();
            } else {
                response = await this.submitSourceFromLocalDir();
            }


            this.scanId = this.extractScanIdFrom(response);
            this.stopwatch.start();
            this.log.info("Scan started successfully. Scan ID: " + this.scanId);
        } catch (err) {
            throw Error("Error creating CxSCA scan. " + err.message);
        }
    }

    private async submitSourceFromRemoteRepo(): Promise<any> {
        this.log.info("Using remote repository flow.");
        const repoInfo: RemoteRepositoryInfo | undefined = this.config.remoteRepositoryInfo;
        if (!repoInfo) {
            throw Error(`URL must be provided in CxSCA configuration when using source location of type ${SourceLocationType.REMOTE_REPOSITORY}.`);
        }
        return await this.sendStartScanRequest(SourceLocationType.REMOTE_REPOSITORY, repoInfo.url);
    }

    private async getSourceUploadUrl(): Promise<string> {
        this.config.includeSource
        const response: any = await this.httpClient.postRequest(ScaClient.ZIP_UPLOAD, {});
        if (!response || !response["url"]) {
            throw Error("Unable to get the upload URL.");
        }
        return response["url"];
    }

    private async submitSourceFromLocalDir(): Promise<any> {
        const tempFilename = tmpNameSync({ prefix: 'cxsrc-', postfix: '.zip' });
        let filePathFiltersAnd: FilePathFilter[] = [new FilePathFilter(this.config.dependencyFileExtension, this.config.dependencyFolderExclusion)];
        let filePathFiltersOr: FilePathFilter[] = [];
        let fingerprintsFilePath = '';
        
        if(this.config.configFilePaths){
        await this.copyConfigFileToSourceDir(this.sourceLocation);
        }
        if (!Boolean(this.config.includeSource)) {
            this.log.info("Using manifest and fingerprint flow.");
            const projectResolvingConfiguration = await this.fetchProjectResolvingConfiguration();
            const manifestsIncludeFilter = new FilePathFilter(projectResolvingConfiguration.getManifestsIncludePattern(), '')

            if (!manifestsIncludeFilter.hasInclude())
                throw Error(`Using manifest only mode requires include filter. Resolving config does not have include patterns defined: ${projectResolvingConfiguration.getManifestsIncludePattern()}`)

            filePathFiltersOr.push(manifestsIncludeFilter);

            fingerprintsFilePath = await this.createScanFingerprintsFile([...filePathFiltersAnd, new FilePathFilter(projectResolvingConfiguration.getFingerprintsIncludePattern(), '')]);

            if (fingerprintsFilePath) {
                filePathFiltersOr.push(new FilePathFilter(ScaClient.FINGERPRINT_FILE_NAME, ''));
            }
        } else if (this.config.fingerprintsFilePath) {
            throw Error('Conflicting config properties, can\'t save fingerprint file when includeSource flag is set to true.');
        } else {
            this.log.info("Using local directory flow.");
        }

        const zipper = new Zipper(this.log, filePathFiltersAnd, filePathFiltersOr);
        
        this.log.debug(`Zipping code from ${this.sourceLocation}, ${fingerprintsFilePath} into file ${tempFilename}`);
        const zipResult = await zipper.zipDirectory(this.sourceLocation, tempFilename, fingerprintsFilePath);

        if (zipResult.fileCount === 0) {
            throw new TaskSkippedError('Zip file is empty: no source to scan');
        }

        if (!Boolean(this.config.includeSource) && this.config.fingerprintsFilePath) {
            this.log.debug(`Saving fingerprint file at: ${this.config.fingerprintsFilePath}${path.sep}${ScaClient.DEFAULT_FINGERPRINT_FILENAME}`);
            FileIO.moveFile(fingerprintsFilePath, `${this.config.fingerprintsFilePath}${path.sep}${ScaClient.DEFAULT_FINGERPRINT_FILENAME}`);
        }

        this.log.info('Uploading the zipped data...');
        const uploadedArchiveUrl: string = await this.getSourceUploadUrl();
        await this.uploadToAWS(uploadedArchiveUrl, tempFilename);
        return await this.sendStartScanRequest(SourceLocationType.LOCAL_DIRECTORY, uploadedArchiveUrl);
    }

    private async copyConfigFileToSourceDir(sourceLocation:string) {
        let arrayOfConfigFilePath = this.config.configFilePaths;
        let format = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/;
        let replaceString=/^.*[\\\/]/;
        for (let index = 0; index < arrayOfConfigFilePath.length; index++) {
            let sourceFile = arrayOfConfigFilePath[index];
            let fileSeperator = path.sep;
            //extracting filename from source file to to destination path
            if(!(format.test(sourceFile))){
                sourceFile=sourceLocation+fileSeperator+sourceFile;
            }
            //extracting filename from source file
            let filename = sourceFile.replace(replaceString, '');
            let destDir = sourceLocation + fileSeperator + ScaClient.SCA_CONFIG_FOLDER_NAME;
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir);
            }
            //attaching file name with destdir for writing to destination
            destDir=destDir+fileSeperator+filename;
            let fileWritten;
            if(!fs.existsSync(sourceFile)){
                this.log.error("File is not present at location : "+sourceFile);
                continue;
            }else{
                fileWritten = fs.createReadStream(sourceFile).pipe(fs.createWriteStream(destDir));
                this.log.info("Config file (" + sourceFile + ") copied to directory: " + destDir);
            }
        }
    }

    private async createScanFingerprintsFile(fingerprintsFileFilter: FilePathFilter[]): Promise<string> {
        const fingerprintsCollector = new ScaFingerprintCollector(this.log, fingerprintsFileFilter);
        const fingerprintsCollection = await fingerprintsCollector.collectFingerprints(this.sourceLocation);

        if (fingerprintsCollection.fingerprints && fingerprintsCollection.fingerprints.length) {
            const fingerprintsFilePath = `${os.tmpdir()}${path.sep}${ScaClient.FINGERPRINT_FILE_NAME}`;

            FileIO.writeToFile(fingerprintsFilePath, fingerprintsCollection);

            return fingerprintsFilePath;
        }

        return '';
    }

    private async fetchProjectResolvingConfiguration(): Promise<ScaResolvingConfiguration> {
        const guid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c: string) => {
            const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
        this.log.info(`Sending a request to fetch resolving configuration.`);
        const response: any = await this.httpClient.getRequest(ScaClient.RESOLVING_CONFIGURATION_API(guid));
        return new ScaResolvingConfiguration((response['manifests'] || []), (response['fingerprints'] || []));
    }

    private async uploadToAWS(uploadUrl: string, file: string) {
        this.log.debug(`Sending PUT request to ${uploadUrl}`);
        const child_process = require('child_process');
        let command;
        if (this.scanConfig.enableProxy && this.scanConfig.proxyConfig && this.scanConfig.proxyConfig.proxyHost != '') {
            if (this.scanConfig.proxyConfig.proxyUser && this.scanConfig.proxyConfig.proxyPass) {
                command = `curl -U ${this.scanConfig.proxyConfig.proxyUser}:${this.scanConfig.proxyConfig.proxyPass} -x ${this.scanConfig.proxyConfig.proxyHost} -X PUT -L "${uploadUrl}" -H "Content-Type:" -T "${file}"`;
            } else {
                command = `curl -x ${this.scanConfig.proxyConfig.proxyHost} -X PUT -L "${uploadUrl}" -H "Content-Type:" -T "${file}"`;
            }
        } else {
            command = `curl -X PUT -L "${uploadUrl}" -H "Content-Type:" -T "${file}"`;
        }
        child_process.execSync(command, { stdio: 'pipe' });
    }

    private async sendStartScanRequest(sourceLocation: SourceLocationType, sourceUrl: string): Promise<any> {
        this.log.info("Sending a request to start scan.");
        let scanConfigValue:ScanConfiguration[]=[];
       if(this.config.isExploitable){
        scanConfigValue.push(await this.getScanConfig());
       }
        const request = {
            project: {
                id: this.projectId,
                type: sourceLocation,
                handler: {
                    url: sourceUrl
                },
            },
            config:scanConfigValue
        };
        return await this.httpClient.postRequest(ScaClient.CREATE_SCAN, request);
    }
    private async  getScanConfig():Promise<ScanConfiguration>{
        //fetching from configuration
        const sastProId:string=this.config.sastProjectId;
        const sastSerUrl:string=this.config.sastServerUrl;
        const sastUser:string=this.config.sastUsername;
        const sastPass:string=this.config.sastPassword;
        const sastProject:string=this.config.sastProjectName;
        const ourMap: Map<string, string> = this.config.envVariables;
        let scaValue:ScaScanConfigValue=new ScaScanConfigValue;
        scaValue.sastProjectName=sastProject;
        scaValue.sastPassword=sastPass;
        scaValue.sastUsername=sastUser;
        scaValue.sastProjectId=sastProId;
        scaValue.environmentVariables=JSON.stringify(Array.from(ourMap.entries()));
        scaValue.sastServerUrl=sastSerUrl;
        const valueConfiguration:ScanConfiguration=new ScanConfiguration;
        valueConfiguration.scanConfigValue=scaValue;
        valueConfiguration.type='sca';
        return valueConfiguration;

    }
    private extractScanIdFrom(response: any): string {
        if (response && response["id"]) {
            return response["id"];
        }
        throw Error('Unable to get scan ID.');
    }

    private logBuildFailure(failure: ScanSummary) {
        this.log.error(
            `********************************************
The Build Failed for the Following Reasons:
********************************************`);
        this.logPolicyCheckError(failure.policyCheck);
        if (failure.thresholdErrors.length) {
            this.log.error('Exceeded CxSCA Vulnerability Threshold.');
            for (const error of failure.thresholdErrors) {
                this.log.error(`SCA ${error.severity} severity results are above threshold. Results: ${error.actualViolationCount}. Threshold: ${error.threshold}`);
            }
        }
    }

    public async waitForScanResults(result: ScanResults) {
        this.log.info("------------------------------------ Get CxSCA Results -----------------------------------");
        const waiter: SCAWaiter = new SCAWaiter(this.scanId, this.httpClient, this.stopwatch, this.log);
        await waiter.waitForScanToFinish();
        const scaResults: SCAResults = await this.retrieveScanResults();
        const scaReportResults: ScaReportResults = new ScaReportResults(scaResults, this.config);
        await this.addScaPolicyViolationsToScanResults(scaResults);
        await this.printPolicyEvaluation(scaResults.scaPolicyViolation, this.config.scaEnablePolicyViolations);
        await this.determinePolicyViolation(scaResults);
        const vulResults = {
            highResults: scaReportResults.highVulnerability,
            mediumResults: scaReportResults.mediumVulnerability,
            lowResults: scaReportResults.lowVulnerability
        };
        const evaluator = new ScaSummaryEvaluator(this.config);
        const summary = evaluator.getScanSummary(vulResults, scaResults);

        if (summary.hasErrors()) {
            result.buildFailed = true;
            this.logBuildFailure(summary);
        }
        result.scaResults = scaReportResults;
    }

    private async determinePolicyViolation(scaResults: SCAResults) {
        const PolicyEvaluation = scaResults.scaPolicyViolation;
        if (PolicyEvaluation) {
            for (const index in PolicyEvaluation) {
                if (PolicyEvaluation[index].actions.breakBuild) {
                    scaResults.scaPolicies.push(PolicyEvaluation[index].name);
                }
            }
        }
    }

    private logPolicyCheckError(policyCheck: { violatedPolicyNames: string[] }) {
        if (policyCheck.violatedPolicyNames.length) {
            this.log.error('Project policy status: violated');
        }
    }

    private async printPolicyEvaluation(policy: PolicyEvaluation[], isPolicyViolationEnabled: boolean) {
        if (isPolicyViolationEnabled && policy) {
            this.log.info("==============================================================================");
            for (let index = 0; index < policy.length; index++) {
                let rules: PolicyRule[] = [];
                const pol = policy[index];
               
                this.log.info("  Policy name: " + pol.name + " | Violated:" + pol.isViolated + " | Policy Description: " + pol.description);
                rules = pol.rules;
                rules.forEach((value) => {
                    this.log.info("     Rule name: " + value.name + " | Violated: " + value.isViolated);
                });
            }
            this.log.info("==============================================================================");
        }
    }

    private async addScaPolicyViolationsToScanResults(result: SCAResults) {
        if (!this.config.scaEnablePolicyViolations) {
            return;
        }
        this.log.debug(" Fetching SCA policy violation. ");
        const reportID = await this.getReportId();
        const policyEvaluation = await this.getProjectViolations(reportID);
        this.log.debug(" Successfully fetched SCA policy violations. ");
        result.scaPolicyViolation = policyEvaluation;
    }

    private async getProjectViolations(reportID: string): Promise<PolicyEvaluation[]> {
        const path = `policy-management/policy-evaluation/?reportId=${reportID}`;
        return this.httpClient.getRequest(path, { baseUrlOverride: this.config.apiUrl });
    }

    private async retrieveScanResults(): Promise<SCAResults> {
        this.log.info("Retrieving CxSCA scan results.");
        try {
            const reportId: string = await this.getReportId();
            const result: SCAResults = new SCAResults();
            result.scanId = this.scanId;
            const scanSummary: ScaSummaryResults = await this.getSummaryReport(reportId);
            result.summary = scanSummary;
            const findings: Finding[] = await this.getFindings(reportId);
            result.findings = findings;
            const packages: Package[] = await this.getPackages(reportId);
            result.packages = packages;
            const reportLink: string = this.getWebReportLink(reportId);
            result.webReportLink = reportLink;
            if (reportLink) {
                this.log.info("CxSCA scan results location: " + reportLink);
            }
            result.scaResultReady = true;
            this.log.info("Retrieved CxSCA results successfully.");
            return result;
        }
        catch (err) {
            throw Error("Error retrieving CxSCA scan results. " + err.message);
        }
    }

    private getWebReportLink(reportId: string): string {
        const MESSAGE = "Unable to generate web report link. ";
        let result: string = '';

        try {
            const webAppUrl: string = this.config.webAppUrl;
            if (!webAppUrl || webAppUrl === '') {
                this.log.warning(MESSAGE + "Web app URL is not specified.");
            } else {
                result = url.resolve(webAppUrl, `/#/projects/${this.projectId}/reports/${reportId}`);
            }
        } catch (err) {
            this.log.warning(MESSAGE + err);
        }
        return result;
    }

    private async getSummaryReport(reportId: string): Promise<ScaSummaryResults> {
        this.log.debug("Getting summary report.");
        const result: ScaSummaryResults = await this.httpClient.getRequest(`/risk-management/riskReports/${reportId}/summary`) as ScaSummaryResults;
        this.printSummaryResult(result);
        return result;
    }

    private printSummaryResult(summary: ScaSummaryResults) {
        this.log.info("\n----CxSCA risk report summary----");
        this.log.info("Created on: " + summary.createdOn);
        this.log.info("Direct packages: " + summary.directPackages);
        this.log.info("High vulnerabilities: " + summary.highVulnerabilityCount);
        this.log.info("Medium vulnerabilities: " + summary.mediumVulnerabilityCount);
        this.log.info("Low vulnerabilities: " + summary.lowVulnerabilityCount);
        this.log.info("Risk report ID: " + summary.riskReportId);
        this.log.info("Scan ID: " + this.scanId);
        this.log.info("Risk score: " + summary.riskScore);
        this.log.info("Total packages: " + summary.totalPackages);
        this.log.info("Total outdated packages: " + summary.totalOutdatedPackages + '\n');
    }

    private async getFindings(reportId: string): Promise<Finding[]> {
        this.log.info("Getting findings.");
        const findings: Finding[] = await this.httpClient.getRequest(`/risk-management/riskReports/${reportId}/vulnerabilities`);
        return findings;
    }

    private async getPackages(reportId: string): Promise<Package[]> {
        this.log.info("Getting packages.");
        const packages: Package[] = await this.httpClient.getRequest(`/risk-management/riskReports/${reportId}/packages`);
        return packages;
    }

    private async getReportId(): Promise<string> {
        this.log.debug("Getting report ID by scan ID: " + this.scanId);
        const reportId: string = await this.httpClient.getRequest(`/risk-management/scans/${this.scanId}/riskReportId`);
        this.log.info("Report ID is: " + reportId);
        return reportId;
    }

    public getLatestScanResultsLink() {
        const webAppUrl: string = this.config.webAppUrl;
        if (!webAppUrl || webAppUrl === '') {
            this.log.warning("Unable to get last scan results link. Web app URL is not specified.");
        } else {
            const lastScanResultsLink: string = `${webAppUrl}/#/projects/${this.projectId}/overview`;
            this.log.info("CxSCA last scan results location: " + lastScanResultsLink);
        }
    }

    public async getLatestScanResults(result: ScanResults) {
        const lastScanSummary: ScaSummaryResults[] = await this.httpClient.getRequest(`/risk-management/riskReports?projectId=${this.projectId}&size=1`);
        if (lastScanSummary && lastScanSummary.length === 1) {
            const scaResults: SCAResults = new SCAResults();
            this.printSummaryResult(lastScanSummary[0]);
            scaResults.summary = lastScanSummary[0];
            scaResults.scaResultReady = true;
            scaResults.webReportLink = `${this.config.webAppUrl}/#/projects/${this.projectId}/overview`;
            const scaReportResults: ScaReportResults = new ScaReportResults(scaResults, this.config);
            result.scaResults = scaReportResults;
        }
    }
}
