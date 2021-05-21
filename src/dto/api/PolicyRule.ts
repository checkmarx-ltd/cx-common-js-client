export class PolicyRule{
    private _isViolated: boolean = false;
    public get isViolated(): boolean {
        return this._isViolated;
    }
    public set isViolated(value: boolean) {
        this._isViolated = value;
    }
    private _id: string = '';
    private _name: string = '';
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

}