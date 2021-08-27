/**
 * This class contains details required for SSO login for authorization code grant type
 */
export class AuthSSODetails  {
   
    private _clientId = '';
    private _clientSecret = '';
    private _code: string = '';
    private _scope = '';
    private _redirectURI = '';
    
    public get clientId(): string {
        return this._clientId;
    }

    public set clientId(value: string) {
        this._clientId = value;
    }

    public get clientSecret(): string {
        return this._clientSecret;
    }

    public set clientSecret(value: string) {
        this._clientSecret = value;
    }
    
    public get code(): string {
        return this._code;
    }

    public set code(value: string) {
        this._code = value;
    }

    public get scope(): string {
        return this._scope;
    }

    public set scope(value: string) {
        this._scope = value;
    }
    public get redirectURI(): string {
        return this._redirectURI;
    }

    public set redirectURI(value: string) {
        this._redirectURI = value;
    }

   
}