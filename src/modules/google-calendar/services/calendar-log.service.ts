import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';

const OAUTH_IDENTIFIER: string = 'calendar-oauth';
const EVENTS_IDENTIFIER: string = 'calendar-events';

@Injectable()
export class CalendarLogService {
    public constructor(private readonly logService: LogService) {}

    public started(): void {
        this.logService.info({ message: 'calendar oauth started', identifier: OAUTH_IDENTIFIER });
    }

    public connected(access: string): void {
        this.logService.info({ message: 'calendar connected', identifier: OAUTH_IDENTIFIER, meta: { access } });
    }

    public denied(): void {
        this.logService.info({ message: 'calendar consent denied', identifier: OAUTH_IDENTIFIER });
    }

    public scopeMissing(): void {
        this.logService.warn({ message: 'calendar scope missing', identifier: OAUTH_IDENTIFIER });
    }

    public stateRejected(): void {
        this.logService.warn({ message: 'calendar state rejected', identifier: OAUTH_IDENTIFIER });
    }

    public revoked(): void {
        this.logService.warn({ message: 'calendar permission revoked', identifier: OAUTH_IDENTIFIER });
    }

    public disconnected(count: number): void {
        this.logService.info({ message: 'calendar disconnected', identifier: OAUTH_IDENTIFIER, meta: { connections: count } });
    }

    public operation(operation: string, outcome: string, latencyMs: number): void {
        this.logService.info({ message: 'calendar api call', identifier: EVENTS_IDENTIFIER, meta: { operation, outcome, latencyMs } });
    }
}
