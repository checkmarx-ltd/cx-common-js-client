import { PolicyAction } from "./PolicyAction";
import { PolicyRule } from "./PolicyRule";

export class PolicyEvaluation{
    private _id: string = '';
    private _name: string = '';
    private _description: string = '';
    private _isViolated: boolean = false;
    private _rules: PolicyRule[] = [];
    public get rules(): PolicyRule[] {
        return this._rules;
    }
    public set rules(value: PolicyRule[]) {
        this._rules = value;
    }
    private _actions: PolicyAction = new PolicyAction;
    public get actions(): PolicyAction {
        return this._actions;
    }
    public set actions(value: PolicyAction) {
        this._actions = value;
    }
    public get id(): string {
        return this._id;
    }
    public set id(value: string) {
        this._id = value;
    }
    
    public get description(): string {
        return this._description;
    }
    public set description(value: string) {
        this._description = value;
    }
   
    public get name(): string {
        return this._name;
    }
    public set name(value: string) {
        this._name = value;
    }
    
    public get isViolated(): boolean {
        return this._isViolated;
    }
    public set isViolated(value: boolean) {
        this._isViolated = value;
    }

}