const LOOPBACK: RegExp = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/;

export function isAllowedOrigin(origin: string | undefined, local: boolean, allowed: readonly string[]): boolean {
    if (origin === undefined || origin === '') {
        return true;
    }
    const target: string = origin.trim().toLowerCase();
    if (allowed.includes(target)) {
        return true;
    }
    return local && LOOPBACK.test(target);
}
