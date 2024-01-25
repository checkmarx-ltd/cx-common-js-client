/**
 * This file has defined all required constants
 */

export class APIConstants  {

    public static readonly authorizationEP:string = 'auth/identity/connect/authorize';
    public static readonly accessTokenEP:string = 'auth/identity/connect/token';
    public static readonly userInfoEP:string = 'auth/identity/connect/userinfo';
    public static readonly responseType:string = 'code';
    public static readonly CLIENT_ID:string  = 'client_id';
    public static readonly SCOPE:string  = 'scope';
    public static readonly RESPONSE_TYPE:string  = 'response_type';
    public static readonly REDIRECT_URI:string  = 'redirect_uri';
    public static readonly GRANT_TYPE:string  = 'grant_type';
    public static readonly AUTHORIZATION_CODE:string  = 'authorization_code';
    public static readonly REFRESH_TOKEN:string  = 'refresh_token';
    public static readonly BEARER:string  = 'BEARER';
}