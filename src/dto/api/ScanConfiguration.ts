import { ScanConfigValue } from "./ScanConfigValue";

export class ScanConfiguration {
    private _type: string = '';

    public get type(): string {
        return this._type;
    }
    public set type(value: string) {
        this._type = value;
    }
    private _scanConfigValue: ScanConfigValue = '';
    public get scanConfigValue(): ScanConfigValue {
        return this._scanConfigValue;
    }
    public set scanConfigValue(value: ScanConfigValue) {
        this._scanConfigValue = value;
    }


}