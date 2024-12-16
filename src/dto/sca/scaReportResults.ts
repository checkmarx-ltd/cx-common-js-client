import { CveReportTableRow } from './report/cveReportTableRow';
import { Finding } from './report/finding';
import { Severity } from './report/severity';
import { SCAResults } from './scaResults';
import { Package } from './report/package';
import { ScaSummaryResults } from './report/scaSummaryResults';
import { ScaConfig } from './scaConfig';

export class ScaReportResults {
    private _resultReady: boolean = false;
    private _criticalVulnerability: number = 0;
    private _highVulnerability: number = 0;
    private _mediumVulnerability: number = 0;
    private _lowVulnerability: number = 0;
    private _summaryLink: string = '';
    private _vulnerableAndOutdated: number = 0;
    private _nonVulnerableLibraries: number = 0;
    private _scanStartTime: string = '';
    private _scanEndTime: string = '';
    private _dependencyCriticalCVEReportTable: CveReportTableRow[] = [];
    private _dependencyHighCVEReportTable: CveReportTableRow[] = [];
    private _dependencyMediumCVEReportTable: CveReportTableRow[] = [];
    private _dependencyLowCVEReportTable: CveReportTableRow[] = [];
    private _totalLibraries: number = 0;
    private _packages: Package[] = [];
    private _summary: ScaSummaryResults | any;
    private _vulnerabilityThreshold: boolean = false;
    private _criticalThreshold?: number;
    private _highThreshold?: number;
    private _mediumThreshold?: number;
    private _lowThreshold?: number;

    constructor(scaResults: SCAResults, scaConfig: ScaConfig) {
        if (scaConfig) {
            this._vulnerabilityThreshold = scaConfig.vulnerabilityThreshold;
            this._criticalThreshold = scaConfig.criticalThreshold;
            this._highThreshold = scaConfig.highThreshold;
            this._mediumThreshold = scaConfig.mediumThreshold;
            this._lowThreshold = scaConfig.lowThreshold;
        }

        if (scaResults) {
            this._resultReady = scaResults.scaResultReady;
            this._summaryLink = scaResults.webReportLink;
            this._packages = scaResults.packages;
            this._summary = scaResults.summary;

            if (scaResults.summary) {
                this._criticalVulnerability = scaResults.summary.criticalVulnerabilityCount;
                this._highVulnerability = scaResults.summary.highVulnerabilityCount;
                this._mediumVulnerability = scaResults.summary.mediumVulnerabilityCount;
                this._lowVulnerability = scaResults.summary.lowVulnerabilityCount;
                const dateFormat = require('dateformat');
                this._scanStartTime = dateFormat(scaResults.summary.createdOn, "default");
                this._scanEndTime = "";
                this._totalLibraries = scaResults.summary.totalPackages;
            }

            this.calculateVulnerableAndOutdatedPackages();
            this.setDependencyCVEReportTable(scaResults.findings);
        }
    }

    private calculateVulnerableAndOutdatedPackages() {
        let sum: number;
        (this._packages || []).forEach(pckg => {
            if (pckg) {
                sum = pckg.criticalVulnerabilityCount != undefined ? pckg.criticalVulnerabilityCount : 0 +
                    pckg.highVulnerabilityCount +
                    pckg.mediumVulnerabilityCount +
                    pckg.lowVulnerabilityCount;
                if (sum === 0) {
                    this._nonVulnerableLibraries++;
                }
                else if (sum > 0 && pckg.outdated) {
                    this._vulnerableAndOutdated++;
                }
            }
        });
    }

    private setDependencyCVEReportTable(findings: Finding[]) {
        let row: CveReportTableRow;
        (findings || []).forEach(finding => {
            if (finding) {
                row = new CveReportTableRow(finding);
                if (finding.severity === Severity.LOW) {
                    this._dependencyLowCVEReportTable.push(row);
                }
                else if (finding.severity === Severity.MEDIUM) {
                    this._dependencyMediumCVEReportTable.push(row);
                }
                else if (finding.severity === Severity.HIGH) {
                    this._dependencyHighCVEReportTable.push(row);
                }
                else if (finding.severity === Severity.CRITICAL) {
                    this._dependencyCriticalCVEReportTable.push(row);
                }
            }
        });
    }

    public get resultReady(): boolean {
        return this._resultReady;
    }

    public set resultReady(value: boolean) {
        this._resultReady = value;
    }

    public get criticalVulnerability(): number {
        return this._criticalVulnerability;
    }

    public set criticalVulnerability(value: number) {
        this._criticalVulnerability = value;
    }

    public get highVulnerability(): number {
        return this._highVulnerability;
    }

    public set highVulnerability(value: number) {
        this._highVulnerability = value;
    }

    public get mediumVulnerability(): number {
        return this._mediumVulnerability;
    }

    public set mediumVulnerability(value: number) {
        this._mediumVulnerability = value;
    }

    public get lowVulnerability(): number {
        return this._lowVulnerability;
    }

    public set lowVulnerability(value: number) {
        this._lowVulnerability = value;
    }

    public get summaryLink(): string {
        return this._summaryLink;
    }

    public set summaryLink(value: string) {
        this._summaryLink = value;
    }

    public get vulnerableAndOutdated(): number {
        return this._vulnerableAndOutdated;
    }

    public set vulnerableAndOutdated(value: number) {
        this._vulnerableAndOutdated = value;
    }

    public get nonVulnerableLibraries(): number {
        return this._nonVulnerableLibraries;
    }

    public set nonVulnerableLibraries(value: number) {
        this._nonVulnerableLibraries = value;
    }

    public get scanStartTime(): string {
        return this._scanStartTime;
    }

    public set scanStartTime(value: string) {
        this._scanStartTime = value;
    }

    public get scanEndTime(): string {
        return this._scanEndTime;
    }

    public set scanEndTime(value: string) {
        this._scanEndTime = value;
    }

    public get totalLibraries(): number {
        return this._totalLibraries;
    }

    public set totalLibraries(value: number) {
        this._totalLibraries = value;
    }

    public get dependencyCriticalCVEReportTable(): CveReportTableRow[] {
        return this._dependencyCriticalCVEReportTable;
    }

    public set dependencyCriticalCVEReportTable(value: CveReportTableRow[]) {
        this._dependencyCriticalCVEReportTable = value;
    }

    public get dependencyHighCVEReportTable(): CveReportTableRow[] {
        return this._dependencyHighCVEReportTable;
    }

    public set dependencyHighCVEReportTable(value: CveReportTableRow[]) {
        this._dependencyHighCVEReportTable = value;
    }

    public get dependencyMediumCVEReportTable(): CveReportTableRow[] {
        return this._dependencyMediumCVEReportTable;
    }

    public set dependencyMediumCVEReportTable(value: CveReportTableRow[]) {
        this._dependencyMediumCVEReportTable = value;
    }

    public get dependencyLowCVEReportTable(): CveReportTableRow[] {
        return this._dependencyLowCVEReportTable;
    }

    public set dependencyLowCVEReportTable(value: CveReportTableRow[]) {
        this._dependencyLowCVEReportTable = value;
    }

    public get packages(): Package[] {
        return this._packages;
    }

    public set packages(value: Package[]) {
        this._packages = value;
    }

    public get summary(): ScaSummaryResults | any {
        return this._summary;
    }

    public set summary(value: ScaSummaryResults | any) {
        this._summary = value;
    }

    public get vulnerabilityThreshold(): boolean {
        return this._vulnerabilityThreshold;
    }

    public set vulnerabilityThreshold(value: boolean) {
        this._vulnerabilityThreshold = value;
    }

    public get criticalThreshold(): number | undefined {
        return this._criticalThreshold;
    }

    public set criticalThreshold(value: number | undefined) {
        this._criticalThreshold = value;
    }

    public get highThreshold(): number | undefined {
        return this._highThreshold;
    }

    public set highThreshold(value: number | undefined) {
        this._highThreshold = value;
    }

    public get mediumThreshold(): number | undefined {
        return this._mediumThreshold;
    }

    public set mediumThreshold(value: number | undefined) {
        this._mediumThreshold = value;
    }

    public get lowThreshold(): number | undefined {
        return this._lowThreshold;
    }

    public set lowThreshold(value: number | undefined) {
        this._lowThreshold = value;
    }
}