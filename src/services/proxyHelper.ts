import { ProxyConfig } from "..";

export class ProxyHelper {
    static getFormattedProxy(proxy: ProxyConfig): string {
        //if host begins with http:\\ or https:\\ cut and save into var, and get the host ready
        let protocol;
        let host;
        let proxyURL;
        if (proxy.resolvedProxyUrl != '' && proxy.resolvedProxyUrl != undefined) {
            return proxy.resolvedProxyUrl;
        }
        if (proxy.proxyHost.startsWith('https://')) {
            protocol = 'https://';
            host = proxy.proxyHost.substring(8, proxy.proxyHost.length);
        } else if (proxy.proxyHost.startsWith('http://')) {
            protocol = 'http://';
            host = proxy.proxyHost.substring(7, proxy.proxyHost.length);
        } else {
            protocol = 'http://';
            host = proxy.proxyHost;
        }
        //build proxy string with format protocol:\\username:password@url:port
        if (proxy.proxyUser != '' && proxy.proxyPass != '') {
            proxyURL = `${protocol}${proxy.proxyUser}:${proxy.proxyPass}@${host}`;
        } else {
            //if no authentication protocol:\\url:port
            proxyURL = `${protocol}${host}`;
        }
        return proxyURL;
    }
}