import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { PlatformAuditRecorderService } from '../../identity/services/platform-audit-recorder.service';
import { IssuedPlatformToken, PlatformTokenItem, PlatformTokenService } from '../../identity/services/platform-token.service';
import {
    CreatedPlatformTokenView,
    CreatePlatformTokenDto,
    PlatformTokenListView,
    PlatformTokenView
} from '../validation/platform-tokens.schemas';

function viewOf(token: PlatformTokenItem): PlatformTokenView {
    return {
        id: token.id,
        name: token.name,
        hint: token.tokenHint,
        createdByUserId: token.createdByUserId,
        expiresAt: token.expiresAt.toISOString(),
        lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
        revokedAt: token.revokedAt?.toISOString() ?? null,
        createdAt: token.createdAt.toISOString()
    };
}

@Injectable()
export class PlatformTokensApplication {
    public constructor(
        private readonly tokens: PlatformTokenService,
        private readonly audit: PlatformAuditRecorderService,
        private readonly context: AppContext
    ) {}

    @UsingTransaction()
    public async create(input: CreatePlatformTokenDto): Promise<CreatedPlatformTokenView> {
        const operatorUserId: string = this.operator();
        const issued: IssuedPlatformToken = await this.tokens.issue(operatorUserId, input.name, input.expiresInDays);
        await this.audit.platformTokenCreated(operatorUserId, {
            tokenId: issued.token.id,
            name: issued.token.name,
            expiresAt: issued.token.expiresAt.toISOString()
        });
        return { ...viewOf(issued.token), token: issued.secret };
    }

    public async list(): Promise<PlatformTokenListView> {
        const tokens: PlatformTokenItem[] = await this.tokens.list();
        return { items: tokens.map(viewOf) };
    }

    @UsingTransaction()
    public async revoke(id: string): Promise<void> {
        const token: PlatformTokenItem = await this.tokens.revoke(id);
        await this.audit.platformTokenRevoked(this.operator(), { tokenId: token.id, name: token.name });
    }

    private operator(): string {
        return this.tokens.operatorOf(this.context.get().userId);
    }
}
