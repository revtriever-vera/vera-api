import { CalendarAccess, READ_ONLY_SCOPES, WRITE_SCOPES } from './calendar.types';

const WRITE: ReadonlySet<string> = new Set(WRITE_SCOPES);
const READ_ONLY: ReadonlySet<string> = new Set(READ_ONLY_SCOPES);

export function accessFromScopes(scopes: readonly string[]): CalendarAccess | null {
    if (scopes.some((scope: string): boolean => WRITE.has(scope))) {
        return 'read_write';
    }
    return scopes.some((scope: string): boolean => READ_ONLY.has(scope)) ? 'read_only' : null;
}
