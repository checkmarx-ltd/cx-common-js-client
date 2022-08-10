export interface ProxyConfig {
    proxyHost: string;
    proxyPort: string | undefined;
    proxyUser: string | undefined;
    proxyPass: string | undefined;
    proxyUrl: string | undefined;
    //Placeholder to carry sast,sca proxy urls from plugin to common client. Not used inside httpclient
    sastProxyUrl: string | undefined;
    scaProxyUrl: string | undefined;
    resolvedProxyUrl: string | undefined;
}