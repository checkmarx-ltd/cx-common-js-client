export interface ProxyConfig {
    proxyHost: string;
    proxyPort: string | undefined;
    proxyUser: string | undefined;
    proxyPass: string | undefined;
    proxyUrl: string | undefined;
    resolvedProxyUrl: string | undefined;
}