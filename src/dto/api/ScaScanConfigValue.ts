import { ScanConfigValue } from "./ScanConfigValue";

export class ScaScanConfigValue implements ScanConfigValue {
    public environmentVariables: string = '';
    public sastProjectId: string = '';
    public sastServerUrl: string = '';
    public sastUsername: string = '';
    public sastProjectName: string = '';
    public sastPassword: string='';
    
    constructor(sastServerURL:string,sastUser:string,sastPass:string,sastPrName:string,sastPrId:string,env:string){
        this.environmentVariables=env;
        this.sastServerUrl=sastServerURL;
        this.sastUsername=sastUser;
        this.sastPassword=sastPass;
        this.sastProjectName=sastPrName;
        this.sastProjectId=sastPrId;
        
    }
    
}