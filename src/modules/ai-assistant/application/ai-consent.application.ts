import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { hasRole } from '../../identity/services/role-rank';
import { CurrentUserService } from '../../identity/services/current-user.service';
import { PlanGateService } from '../../plans/services/plan-gate.service';
import { AI_FEATURE, AiConsent, AiConsentSource } from '../domain/ai-assistant.types';
import { AiNoticeOutdatedError } from '../domain/ai-assistant.errors';
import { AiConsentDomain } from '../domain/ai-consent.domain';
import { AI_NOTICE_VERSION } from '../domain/ai-notice';
import { AiAssistantLogService } from '../services/ai-assistant-log.service';
import { AiAssistantMetricsService } from '../services/ai-assistant-metrics.service';
import { AiConsentService, isGrantedBy } from '../services/ai-consent.service';
import { AiDataPurgeRegistry } from '../services/ai-data-purge.registry';
import { ConsentRequest, ConsentView } from '../validation/ai-consent.schemas';

@Injectable()
export class AiConsentApplication {
    public constructor(
        private readonly consent: AiConsentService,
        private readonly consents: AiConsentDomain,
        private readonly purges: AiDataPurgeRegistry,
        private readonly gate: PlanGateService,
        private readonly users: CurrentUserService,
        private readonly context: AppContext,
        private readonly logs: AiAssistantLogService,
        private readonly metrics: AiAssistantMetricsService
    ) {}

    public async view(): Promise<ConsentView> {
        const [available, canChange, current]: [boolean, boolean, AiConsent | null] = await Promise.all([
            this.gate.allows(AI_FEATURE),
            this.canChange(),
            this.consent.current()
        ]);
        const granted: boolean = isGrantedBy(current);
        return {
            available,
            granted,
            needsConsent: !granted,
            noticeVersion: AI_NOTICE_VERSION,
            acceptedNoticeVersion: current?.noticeVersion ?? null,
            grantedAt: current === null ? null : current.grantedAt.toISOString(),
            source: current === null ? null : (current.source as AiConsentSource),
            canChange
        };
    }

    public async accept(request: ConsentRequest): Promise<ConsentView> {
        if (request.noticeVersion !== AI_NOTICE_VERSION) {
            throw new AiNoticeOutdatedError(AI_NOTICE_VERSION);
        }
        await this.consent.accept({ source: request.source });
        return this.view();
    }

    private async canChange(): Promise<boolean> {
        const role: string = (await this.users.require()).role;
        return hasRole(role, 'editor');
    }

    @UsingTransaction()
    public async revoke(): Promise<void> {
        await this.consents.revoke(this.context.get().userId ?? null);
        const purged: number = await this.purges.purgeAll();
        this.logs.revoked(purged);
        this.metrics.consentRevoked();
    }
}
