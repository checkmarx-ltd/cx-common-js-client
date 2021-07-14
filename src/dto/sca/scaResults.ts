import { ScaSummaryResults } from "./report/scaSummaryResults";
import { Finding } from './report/finding';
import { Package } from './report/package';
import { PolicyEvaluation } from "../api/PolicyEvaluation";

export class SCAResults {
    private _scanId: string = '';
    private _summary: ScaSummaryResults | any;
    private _webReportLink: string = '';
    private _findings: Finding[] = [];
    private _packages: Package[] = [];
    private _scaResultReady: boolean = false;
    private _scaPolicyViolation: PolicyEvaluation[] = [];
    private _scaPolicies: string[] = [];
    
    public get scaPolicies(): string[] {
        return this._scaPolicies;
    }
    public set scaPolicies(value: string[]) {
        this._scaPolicies = value;
    }

  

    public get scaPolicyViolation(): PolicyEvaluation[] {
        return this._scaPolicyViolation;
    }
    public set scaPolicyViolation(value: PolicyEvaluation[]) {
        this._scaPolicyViolation = value;
    }

    
    public get scanId(): string {
        return this._scanId;
    }

    public set scanId(value: string) {
        this._scanId = value;
    }

    public get summary(): ScaSummaryResults | any {
        return this._summary;
    }

    public set summary(value: ScaSummaryResults | any) {
        this._summary = value;
    }

    public get webReportLink(): string {
        return this._webReportLink;
    }

    public set webReportLink(value: string) {
        this._webReportLink = value;
    }

    public get findings(): Finding[] {
        return this._findings;
    }

    public set findings(value: Finding[]) {
        this._findings = value;
    }

    public get packages(): Package[] {
        return this._packages;
    }

    public set packages(value: Package[]) {
        this._packages = value;
    }

    public get scaResultReady(): boolean {
        return this._scaResultReady;
    }

    public set scaResultReady(value: boolean) {
        this._scaResultReady = value;
    }
}