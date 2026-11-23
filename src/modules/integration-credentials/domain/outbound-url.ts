/* eslint-disable sonar/S1313 -- são os endereços de metadados de nuvem que o bloqueio de SSRF recusa */
const BLOCKED_HOSTS: ReadonlySet<string> = new Set([
    '169.254.169.254',
    'metadata.google.internal',
    'fd00:ec2::254',
    '[fd00:ec2::254]',
    '[::ffff:a9fe:a9fe]'
]);
/* eslint-enable sonar/S1313 */
const LINK_LOCAL_PREFIX: string = '169.254.';
const LOOPBACK_NAMES: ReadonlySet<string> = new Set(['localhost', '[::1]']);
const PRIVATE_IPV4: RegExp = /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

function parse(value: string): URL | null {
    try {
        return new URL(value);
    } catch {
        return null;
    }
}

function isBlocked(host: string): boolean {
    return BLOCKED_HOSTS.has(host) || host.startsWith(LINK_LOCAL_PREFIX);
}

function isLocalNetwork(host: string): boolean {
    return LOOPBACK_NAMES.has(host) || PRIVATE_IPV4.test(host) || host.endsWith('.local') || host.endsWith('.internal');
}

export function isAllowedModelUrl(value: string): boolean {
    const url: URL | null = parse(value);
    if (url === null) {
        return false;
    }
    if (url.username !== '' || url.password !== '' || isBlocked(url.hostname)) {
        return false;
    }
    if (url.protocol === 'https:') {
        return true;
    }
    return url.protocol === 'http:' && isLocalNetwork(url.hostname);
}
