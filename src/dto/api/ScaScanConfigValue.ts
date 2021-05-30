export class ScaScanConfigValue {
    private _environmentVariables: string = '';

    public get environmentVariables(): string {
        return this._environmentVariables;
    }
    public set environmentVariables(value: string) {
        this._environmentVariables = value;
    }

    private _sastProjectId: string = '';
    private _sastServerUrl: string = '';
    private _sastUsername: string = '';
    private _sastProjectName: string = '';
    
   
    public get sastProjectId(): string {
        return this._sastProjectId;
    }
    public set sastProjectId(value: string) {
        this._sastProjectId = value;
    }
    
    public get sastServerUrl(): string {
        return this._sastServerUrl;
    }
    public set sastServerUrl(value: string) {
        this._sastServerUrl = value;
    }
    
    public get sastUsername(): string {
        return this._sastUsername;
    }
    public set sastUsername(value: string) {
        this._sastUsername = value;
    }
    private _sastPassword: string = '';
    public get sastPassword(): string {
        return this._sastPassword;
    }
    public set sastPassword(value: string) {
        this._sastPassword = value;
    }
    
    public get sastProjectName(): string {
        return this._sastProjectName;
    }
    public set sastProjectName(value: string) {
        this._sastProjectName = value;
    }
}