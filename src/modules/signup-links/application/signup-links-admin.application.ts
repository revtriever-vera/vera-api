import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { PlatformAuditRecorderService } from '../../identity/services/platform-audit-recorder.service';
import { RevokeOutcome, SignupLinkDomain } from '../domain/signup-link.domain';
import { LinkOfferInput, SignupLink } from '../domain/signup-links.types';
import { SignupLinkViewMapper } from '../services/signup-link-view.mapper';
import { CreateSignupLinkDto, SIGNUP_LINKS_LIST_LIMIT, SignupLinkListView, SignupLinkView } from '../validation/signup-links.schemas';

@Injectable()
export class SignupLinksAdminApplication {
    public constructor(
        private readonly links: SignupLinkDomain,
        private readonly audit: PlatformAuditRecorderService,
        private readonly mapper: SignupLinkViewMapper,
        private readonly context: AppContext
    ) {}

    @UsingTransaction()
    public async create(input: CreateSignupLinkDto): Promise<SignupLinkView> {
        const now: Date = new Date();
        const operatorUserId: string | null = this.context.get().userId ?? null;
        const link: SignupLink = await this.links.create(this.offerOf(input), operatorUserId, now);
        await this.audit.signupLinkCreated(operatorUserId, {
            linkId: link.id,
            label: link.label,
            trialKind: link.trialKind,
            trialDays: link.trialDays,
            rules: input.rules.length
        });
        return this.mapper.toAdminView(link, now);
    }

    public async list(): Promise<SignupLinkListView> {
        const now: Date = new Date();
        const links: SignupLink[] = await this.links.listNewestFirst(SIGNUP_LINKS_LIST_LIMIT);
        return { items: links.map((link: SignupLink): SignupLinkView => this.mapper.toAdminView(link, now)) };
    }

    @UsingTransaction()
    public async revoke(id: string): Promise<void> {
        const outcome: RevokeOutcome = await this.links.revoke(id, new Date());
        if (!outcome.changed) {
            return;
        }
        await this.audit.signupLinkRevoked(this.context.get().userId ?? null, { linkId: outcome.link.id, label: outcome.link.label });
    }

    private offerOf(input: CreateSignupLinkDto): LinkOfferInput {
        return {
            label: input.label,
            trial: input.trial,
            rules: input.rules,
            maxUses: input.maxUses,
            expiresAt: input.expiresAt === null ? null : new Date(input.expiresAt)
        };
    }
}
