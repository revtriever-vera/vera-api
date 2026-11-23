import { WINDOW_HOURS } from './whatsapp.types';

const HOUR_MS: number = 3_600_000;

export function isWindowOpen(lastInboundAt: Date | null, now: Date): boolean {
    if (lastInboundAt === null) {
        return false;
    }
    return now.getTime() - lastInboundAt.getTime() <= WINDOW_HOURS * HOUR_MS;
}
