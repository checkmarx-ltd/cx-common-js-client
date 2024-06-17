export class ScaSummaryResults {
    private _riskReportId: string = '';
    private _criticalVulnerabilityCount: number = 0;
    private _highVulnerabilityCount: number = 0;
    private _mediumVulnerabilityCount: number = 0;
    private _lowVulnerabilityCount: number = 0;
    private _totalPackages: number = 0;
    private _directPackages: number = 0;
    private _createdOn: string = '';
    private _riskScore: number = 0.0;
    private _totalOutdatedPackages: number = 0;

    public get riskReportId(): string {
        return this._riskReportId;
    }

    public set riskReportId(value: string) {
        this._riskReportId = value;
    }

    public get criticalVulnerabilityCount(): number {
        return this._criticalVulnerabilityCount;
    }

    public set criticalVulnerabilityCount(value: number) {
        this._criticalVulnerabilityCount = value;
    }

    public get highVulnerabilityCount(): number {
        return this._highVulnerabilityCount;
    }

    public set highVulnerabilityCount(value: number) {
        this._highVulnerabilityCount = value;
    }

    public get mediumVulnerabilityCount(): number {
        return this._mediumVulnerabilityCount;
    }

    public set mediumVulnerabilityCount(value: number) {
        this._mediumVulnerabilityCount = value;
    }

    public get lowVulnerabilityCount(): number {
        return this._lowVulnerabilityCount;
    }

    public set lowVulnerabilityCount(value: number) {
        this._lowVulnerabilityCount = value;
    }

    public get totalPackages(): number {
        return this._totalPackages;
    }

    public set totalPackages(value: number) {
        this._totalPackages = value;
    }

    public get directPackages(): number {
        return this._directPackages;
    }

    public set directPackages(value: number) {
        this._directPackages = value;
    }

    public get createdOn(): string {
        return this._createdOn;
    }

    public set createdOn(value: string) {
        this._createdOn = value;
    }

    public get riskScore(): number {
        return this._riskScore;
    }

    public set riskScore(value: number) {
        this._riskScore = value;
    }

    public get totalOutdatedPackages(): number {
        return this._totalOutdatedPackages;
    }

    public set totalOutdatedPackages(value: number) {
        this._totalOutdatedPackages = value;
    }
}