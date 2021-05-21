export class PolicyAction{
    private _breakBuild: boolean = false;
    public get breakBuild(): boolean {
        return this._breakBuild;
    }
    public set breakBuild(value: boolean) {
        this._breakBuild = value;
    }
    
}