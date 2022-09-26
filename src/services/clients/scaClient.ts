import { Logger, PollingSettings, ProxyConfig, SastConfig, ScaConfig, ScanConfig, Waiter } from "../..";
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
import { file, tmpName, tmpNameSync } from "tmp";
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

import { config } from "process";
import { SastClient } from "./sastClient";
import { SpawnScaResolver } from "./SpawnScaResolver";
import { ProxyHelper } from "../proxyHelper";
import { spawn } from "child_process";
import { any } from "micromatch";
const fs = require('fs');
;/**
 * SCA - Software Composition Analysis - is the successor of OSA.
 */
export class ScaClient {
    public static readonly TENANT_HEADER_NAME: string = "Account-Name";
    public static readonly AUTHENTICATION: string = "identity/connect/token";
    public static readonly TEMP_FILE_NAME_TO_SCA_RESOLVER_RESULTS_ZIP: string = "ScaResolverResults";
    public static readonly SCA_RESOLVER_RESULT_FILE_NAME: string = ".cxsca-results.json";

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
    public static readonly SAST_RESOLVER_RESULT_FILE_NAME: string = ".cxsca-sast-results.json";
    public static readonly TEMP_FOLDER_NAME_TO_SCA_RESOLVER_RESULTS = "ScaResolverResultsTemp";

    constructor(private readonly config: ScaConfig,
        private readonly sourceLocation: string,
        private readonly httpClient: HttpClient,
        private readonly log: Logger,
        private readonly proxyConfig: ProxyConfig,
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
        if (!teamName || teamName == '/') {
            this.log.error("Team name for Cx SCA is not specified. ");
        }
        let teamNameArray: Array<string | undefined> = [teamName];
        const request = {
            name: projectName,
            AssignedTeams: teamNameArray
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
            } else if (this.config.isEnableScaResolver) {
                response = await this.submitScaResolverEvidenceFile();

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
        const request = {
            config: [
                {
                    type: 'sca',
                    value: {
                        "includeSourceCode": this.config.includeSource
                    }
                }
            ]
        };

        const response: any = await this.httpClient.postRequest(ScaClient.ZIP_UPLOAD, request);
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

        if (this.config.configFilePaths) {
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
        await this.deleteZip(tempFilename);
        return await this.sendStartScanRequest(SourceLocationType.LOCAL_DIRECTORY, uploadedArchiveUrl);
    }

    /**
    * This method
    *  1) executes sca resolver to generate result json file.
    *  2) create ScaResolverResultsxxxx.zip file with sca resolver result json file to be uploaded for scan
    *  3) Execute initiateScan method to generate SCA scan.
    * @param scaConfig - AST Sca config object
    * @return - Returns the response
    * @throws IOException
    */

    private async submitScaResolverEvidenceFile(): Promise<any> {
        let pathToResultJSONFile: string;
        let pathToSASRResultJSONFile: string = '';        
        let scaResultPathValue = this.getScaResultPathParameter();
        let additionalParameters = this.manageParameters(this.config.scaResolverAddParameters, scaResultPathValue);
        this.config.scaResolverAddParameters = additionalParameters;
        pathToResultJSONFile = this.getScaResolverResultFilePathFromAdditionalParams(this.config.scaResolverAddParameters, scaResultPathValue);
        this.log.info("Path to the evidence file: " + pathToResultJSONFile);
        if (this.checkSastResultPath()) {
            let additionalParameters = this.manageParameters(this.config.scaResolverAddParameters, "--sast-result-path");        

        let exitCode;
        await SpawnScaResolver.runScaResolver(this.config.pathToScaResolver, this.config.scaResolverAddParameters, pathToResultJSONFile, this.log).then(res => {
            exitCode = res;
        })
        let zipFile: string = '';
        if (exitCode == 0) {
            this.log.info("Dependencies resolution completed."); 
            //check for exploitable path
            if (this.checkSastResultPath()) {
                pathToSASRResultJSONFile = this.getScaResolverResultFilePathFromAdditionalParams(this.config.scaResolverAddParameters, "--sast-result-path");                
            }
                //move sca and sast result fingerprints files to temp folder 
                 let parentDir = path.dirname(pathToResultJSONFile);
                 let scaResolverResultDirectory = path.dirname(parentDir);
                 let fileExists = fs.existsSync(parentDir + ScaClient.TEMP_FOLDER_NAME_TO_SCA_RESOLVER_RESULTS);
                 if (!fileExists) {
                 fs.mkdir(path.join(scaResolverResultDirectory, ScaClient.TEMP_FOLDER_NAME_TO_SCA_RESOLVER_RESULTS), (err: any) => {   
                    return console.log(err);                                        
                 });
             }
             scaResolverResultDirectory = scaResolverResultDirectory + path.sep + ScaClient.TEMP_FOLDER_NAME_TO_SCA_RESOLVER_RESULTS.toString();                    
             FileIO.moveFile(pathToResultJSONFile, scaResolverResultDirectory + path.sep + ScaClient.SCA_RESOLVER_RESULT_FILE_NAME);
             if (this.checkSastResultPath()) {
             FileIO.moveFile(pathToSASRResultJSONFile, scaResolverResultDirectory + path.sep + ScaClient.SAST_RESOLVER_RESULT_FILE_NAME);
             }

            await this.zipEvidenceFile(scaResolverResultDirectory).then(res => {
                zipFile = res;
            })
        } else {
            throw Error("Error while running sca resolver executable. Exit code:" + exitCode);
        }
        this.log.info('Uploading the zipped data...');
        const uploadedArchiveUrl: string = await this.getSourceUploadUrl();
        await this.uploadToAWS(uploadedArchiveUrl, zipFile);
        await this.deleteZip(zipFile);
        return this.sendStartScanRequest(SourceLocationType.LOCAL_DIRECTORY, uploadedArchiveUrl);
    }
    async zipEvidenceFile(resultFilePath: string): Promise<string> {
        const tempFilename = tmpNameSync({ prefix: ScaClient.TEMP_FILE_NAME_TO_SCA_RESOLVER_RESULTS_ZIP, postfix: '.zip' });
        this.log.debug(`Zipping source code at ${resultFilePath} into file ${tempFilename}`);
        const zipper = new Zipper(this.log);
        const zipResult = await zipper.zipDirectory(resultFilePath, tempFilename);
        if (zipResult.fileCount === 0) {
            throw new TaskSkippedError('Zip file is empty: no source to scan');
        }
        return tempFilename;
    }

    private async copyConfigFileToSourceDir(sourceLocation: string) {
        let arrayOfConfigFilePath = this.config.configFilePaths;
        let format = /[!@#$%^&*()+\-=\[\]{};':"\\|,<>\/?]+/;
        let replaceString = /^.*[\\\/]/;
        if (this.config.configFilePaths) {
            for (let index = 0; index < arrayOfConfigFilePath.length; index++) {
                let sourceFile = arrayOfConfigFilePath[index].trim();
                if (sourceFile != "" && sourceFile) {
                    let fileSeperator = path.sep;
                    //extracting filename from source file to to destination path
                    if (!(format.test(sourceFile))) {
                        sourceFile = sourceLocation + fileSeperator + sourceFile;
                    }
                    //extracting filename from source file
                    let filename = sourceFile.replace(replaceString, '');
                    let destDir = sourceLocation + fileSeperator + ScaClient.SCA_CONFIG_FOLDER_NAME;
                    if (!fs.existsSync(destDir)) {
                        fs.mkdirSync(destDir);
                    }
                    //attaching file name with destdir for writing to destination
                    destDir = destDir + fileSeperator + filename;
                    let fileWritten;
                    if (!fs.existsSync(sourceFile)) {
                        this.log.error("File is not present at location : " + sourceFile);
                        continue;
                    } else {
                        fileWritten = fs.createReadStream(sourceFile).pipe(fs.createWriteStream(destDir));
                        this.log.info("Config file (" + sourceFile + ") copied to directory: " + destDir);
                    }
                } else {
                    this.log.error("File is not present at location : " + sourceFile);
                }
            }
        }
    }

    private async deleteZip(fileToDelete: string) {
        if (fs.existsSync(fileToDelete)) {
            fs.unlinkSync(fileToDelete);
        } else {
            this.log.error("File from ${fileToDelete} can not deleted. ");
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
        if (this.scanConfig.enableProxy) {
            this.log.info(`scanConfig.enableProxy is TRUE`);
        }

        if (this.proxyConfig && this.proxyConfig.proxyUrl) {

            this.log.info(`proxyConfig is TRUE`);
            this.log.info(`SCA proxy URL: ` + this.proxyConfig.proxyUrl);
        }
        if (this.proxyConfig.proxyUrl) {
            this.log.info(`proxyConfig.proxyUrl is TRUE`);
        }
        //proxyConfig is instance of scaProxyConfig so proxyUrl set to proxyConfig proxy url 
        if (this.scanConfig.enableProxy && this.proxyConfig && this.proxyConfig.proxyUrl) {
            let proxyUrl = this.proxyConfig.proxyUrl;
            command = `curl -x ${proxyUrl} -X PUT -L "${uploadUrl}" -H "Content-Type:" -T "${file}" --ssl-no-revoke`;
        } else {
            command = `curl -X PUT -L "${uploadUrl}" -H "Content-Type:" -T "${file}" --ssl-no-revoke`;
        }
        child_process.execSync(command, { stdio: 'pipe' });
    }

    private async sendStartScanRequest(sourceLocation: SourceLocationType, sourceUrl: string): Promise<any> {
        this.log.info("Sending a request to start scan.");
        const request = {
            project: {
                id: this.projectId,
                type: sourceLocation,
                handler: {
                    url: sourceUrl
                },
            },
            config: [{
                type: 'sca',
                value: {
                    "sastProjectId": this.config.sastProjectId,
                    "sastServerUrl": this.config.sastServerUrl,
                    "sastUsername": this.config.sastUsername,
                    "sastPassword": this.config.sastPassword,
                    "sastProjectName": this.config.sastProjectName,
                    "environmentVariables": JSON.stringify(Array.from(this.config.envVariables)),
                }
            }
            ]
        };
        return await this.httpClient.postRequest(ScaClient.CREATE_SCAN, request);
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
                if (PolicyEvaluation[index].isViolated) {
                    if (PolicyEvaluation[index].actions.breakBuild) {
                        scaResults.scaPolicies.push(PolicyEvaluation[index].name);
                    }
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
            this.log.info("----------------CxSCA Policy Evaluation Results------------");
            for (let index = 0; index < policy.length; index++) {
                let rules: PolicyRule[] = [];
                const pol = policy[index];

                this.log.info("  Policy name: " + pol.name + " | Violated:" + pol.isViolated + " | Policy Description: " + pol.description);
                rules = pol.rules;
                rules.forEach((value) => {
                    this.log.info("     Rule name: " + value.name + " | Violated: " + value.isViolated);
                });
            }
            this.log.info("-----------------------------------------------------------");
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
    
    public manageParameters(scaResolverAddParams: string, arg: string): string{
        let newScaResolverAddParams = "";
        let pathToEvidenceDir = "";        
        let sastResultPath = this.getScaResolverResultFilePathFromAdditionalParams(scaResolverAddParams, arg);
        let fileExists = fs.existsSync(sastResultPath);
        if (!fileExists) {
            let sastResultPathFile = fs.openSync(sastResultPath, 'w');
        }
        if (fs.lstatSync(sastResultPath).isDirectory()) {
            pathToEvidenceDir = sastResultPath;
            if(arg == "-r" || arg == "--resolver-result-path"){
                sastResultPath = sastResultPath + path.sep + this.getTimestampFolder() + path.sep + ScaClient.SCA_RESOLVER_RESULT_FILE_NAME;
                }
                else if(arg == "--sast-result-path"){
                    sastResultPath = sastResultPath + path.sep + this.getTimestampFolder() + path.sep + ScaClient.SAST_RESOLVER_RESULT_FILE_NAME;
                }
        }
        else if (path.isAbsolute(sastResultPath)) {
            let parentDir = path.dirname(sastResultPath);
            if(arg == "-r" || arg == "--resolver-result-path"){
                sastResultPath = parentDir + path.sep + this.getTimestampFolder() + path.sep + ScaClient.SCA_RESOLVER_RESULT_FILE_NAME;
                }
            else if(arg == "--sast-result-path"){
            sastResultPath = parentDir + path.sep + this.getTimestampFolder() + path.sep + ScaClient.SAST_RESOLVER_RESULT_FILE_NAME;
            }
        }
        newScaResolverAddParams = this.setSastResultFilePathFromAdditionalParams(scaResolverAddParams, sastResultPath, arg);
    
        return newScaResolverAddParams;
    }

    public setSastResultFilePathFromAdditionalParams(scaResolverAddParams: string, valueToSet: string, arg: string) { 
        let argument;
        argument = scaResolverAddParams.split(" ");
        scaResolverAddParams = '';

        for (let i = 0; i < argument.length; i++) {
            if (argument[i] == arg) {
                if (argument.length - 1 == i) {
                    argument[i] = valueToSet;
                }
                else {
                    argument[i + 1] = valueToSet;
                }

            }
        }
        scaResolverAddParams = argument.join(" ");
        return scaResolverAddParams.toString();
    }

    public getTimestampFolder() {
    
        let date = new Date();
        const format = {
            dd: this.formatData((date.getDate())),
            mm: this.formatData((date.getMonth() + 1)),
            yyyy: date.getFullYear(),
            HH: this.formatData((date.getHours())),
            hh: this.formatData(((date.getHours()))),
            MM: this.formatData((date.getMinutes())),
            SS: this.formatData((date.getSeconds())),
        };

        let timeStamp = format.yyyy.toString() + (format.mm).toString() + (format.dd).toString() + (format.HH).toString() + (format.MM).toString() + (format.SS).toString();
        return timeStamp;
    }

    public formatData(input: number) {
        if (input > 9) {
            return input;
        } else {
            return `0${input}`;
        }
    }

    public getScaResolverResultFilePathFromAdditionalParams(scaResolverAddParams: string, arg: string): string {
        let argument;
        let resolverResultPath = "";
        argument = scaResolverAddParams.split(" ");
        for (let i = 0; i < argument.length; i++) {
            if (argument[i] == arg) {
                if (argument.length - 1 == i) {
                resolverResultPath = argument[i];
                }
                else {
                    resolverResultPath = argument[i + 1] ;
                }
                break;
            }
        }
        return resolverResultPath;
    }

    public checkSastResultPath(): boolean {
        if (this.config.scaResolverAddParameters.indexOf("--sast-result-path") !== -1) {
            return true;
        }
        return false;
    }

    public getScaResultPathParameter(): string {
        if (this.config.scaResolverAddParameters.indexOf("-r") !== -1) {
            return "-r";
        }
        else
        return "--resolver-result-path";
    }
}
