import { Injectable } from '@nestjs/common';
import { LogService } from '../../../core/observability/log.service';
import { IntegrationKind, TestFailureReason } from '../domain/integration.types';

const INTEGRATIONS: string = 'integrations';

@Injectable()
export class IntegrationsLogService {
    public constructor(private readonly logService: LogService) {}

    public saved(kind: IntegrationKind): void {
        this.logService.info({ message: 'integration saved', identifier: INTEGRATIONS, meta: { kind } });
    }

    public testFailed(kind: IntegrationKind, reason: TestFailureReason): void {
        this.logService.info({ message: 'integration test failed', identifier: INTEGRATIONS, meta: { kind, reason } });
    }

    public removed(kind: IntegrationKind): void {
        this.logService.info({ message: 'integration removed', identifier: INTEGRATIONS, meta: { kind } });
    }

    public unreadable(kind: IntegrationKind): void {
        this.logService.error({ message: 'integration secret unreadable', identifier: INTEGRATIONS, meta: { kind } });
    }
}
