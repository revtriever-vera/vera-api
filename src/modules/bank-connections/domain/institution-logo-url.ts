export const INSTITUTION_LOGO_URL_MAX_LENGTH: number = 500;

const HTTPS_PROTOCOL: string = 'https:';

export function sanitizeLogoUrl(raw: string | null | undefined): string | null {
    const candidate: string = (raw ?? '').trim();
    if (candidate.length === 0 || candidate.length > INSTITUTION_LOGO_URL_MAX_LENGTH) {
        return null;
    }
    try {
        const parsed: URL = new URL(candidate);
        const acceptable: boolean =
            parsed.protocol === HTTPS_PROTOCOL && parsed.username === '' && parsed.password === '' && parsed.hostname !== '';
        return acceptable && parsed.href.length <= INSTITUTION_LOGO_URL_MAX_LENGTH ? parsed.href : null;
    } catch {
        return null;
    }
}
