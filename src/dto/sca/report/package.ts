import { PackageSeverity } from './packageSeverity';
import { PackageUsage } from './packageUsage';
import { DependencyPathSegment } from './dependencyPathSegment';

export class Package {
    private _id: string = '';
    private _name: string = '';
    private _version: string = '';
    private _licenses: string[] = [];

    /**
     * The current values are [Filename, Sha1]. Not considered an enum in SCA API.
     */
    private _matchType: string = '';

    private _criticalVulnerabilityCount: number = 0;
    private _highVulnerabilityCount: number = 0;
    private _mediumVulnerabilityCount: number = 0;
    private _lowVulnerabilityCount: number = 0;
    private _ignoredVulnerabilityCount: number = 0;
    private _numberOfVersionsSinceLastUpdate: number = 0;
    private _newestVersionReleaseDate: string = '';
    private _newestVersion: string = '';
    private _outdated: boolean = false;
    private _releaseDate: string = '';
    private _confidenceLevel: string = '';
    private _riskScore: number = 0.0;
    private _severity: PackageSeverity | any;
    private _locations: string[] = [];
    private _dependencyPaths: DependencyPathSegment[][] = new Array<DependencyPathSegment[]>();
    private _packageRepository: string = '';
    private _isDirectDependency: boolean = false;
    private _isDevelopment: boolean = false;
    private _packageUsage: PackageUsage | any;

    public get id(): string {
        return this._id;
    }

    public set id(value: string) {
        this._id = value;
    }

    public get name(): string {
        return this._name;
    }

    public set name(value: string) {
        this._name = value;
    }

    public get version(): string {
        return this._version;
    }

    public set version(value: string) {
        this._version = value;
    }

    public get licenses(): string[] {
        return this._licenses;
    }

    public set licenses(value: string[]) {
        this._licenses = value;
    }

    public get matchType(): string {
        return this._matchType;
    }

    public set matchType(value: string) {
        this._matchType = value;
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

    public get ignoredVulnerabilityCount(): number {
        return this._ignoredVulnerabilityCount;
    }

    public set ignoredVulnerabilityCount(value: number) {
        this._ignoredVulnerabilityCount = value;
    }

    public get numberOfVersionsSinceLastUpdate(): number {
        return this._numberOfVersionsSinceLastUpdate;
    }

    public set numberOfVersionsSinceLastUpdate(value: number) {
        this._numberOfVersionsSinceLastUpdate = value;
    }

    public get newestVersionReleaseDate(): string {
        return this._newestVersionReleaseDate;
    }

    public set newestVersionReleaseDate(value: string) {
        this._newestVersionReleaseDate = value;
    }

    public get newestVersion(): string {
        return this._newestVersion;
    }

    public set newestVersion(value: string) {
        this._newestVersion = value;
    }

    public get outdated(): boolean {
        return this._outdated;
    }

    public set outdated(value: boolean) {
        this._outdated = value;
    }

    public get releaseDate(): string {
        return this._releaseDate;
    }

    public set releaseDate(value: string) {
        this._releaseDate = value;
    }

    public get confidenceLevel(): string {
        return this._confidenceLevel;
    }

    public set confidenceLevel(value: string) {
        this._confidenceLevel = value;
    }

    public get riskScore(): number {
        return this._riskScore;
    }

    public set riskScore(value: number) {
        this._riskScore = value;
    }

    public get severity(): PackageSeverity | any {
        return this._severity;
    }

    public set severity(value: PackageSeverity | any) {
        this._severity = value;
    }

    public get locations(): string[] {
        return this._locations;
    }

    public set locations(value: string[]) {
        this._locations = value;
    }

    public get dependencyPaths(): DependencyPathSegment[][] {
        return this._dependencyPaths;
    }

    public set dependencyPaths(value: DependencyPathSegment[][]) {
        this._dependencyPaths = value;
    }

    public get packageRepository(): string {
        return this._packageRepository;
    }

    public set packageRepository(value: string) {
        this._packageRepository = value;
    }

    public get isDirectDependency(): boolean {
        return this._isDirectDependency;
    }

    public set isDirectDependency(value: boolean) {
        this._isDirectDependency = value;
    }

    public get isDevelopment(): boolean {
        return this._isDevelopment;
    }

    public set isDevelopment(value: boolean) {
        this._isDevelopment = value;
    }

    public get packageUsage(): PackageUsage | any {
        return this._packageUsage;
    }

    public set packageUsage(value: PackageUsage | any) {
        this._packageUsage = value;
    }
}