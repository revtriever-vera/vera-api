import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { AiConsent, GrantInput } from '../domain/ai-assistant.types';

const ERASE_BATCH: number = 100;

interface AcceptedValues {
    readonly acceptedByUserId: string | null;
    readonly noticeVersion: number;
    readonly source: string;
    readonly grantedAt: Date;
    readonly revokedAt: null;
    readonly revokedByUserId: null;
    readonly updatedAt: Date;
}

@Injectable()
export class AiConsentsRepository extends TenantRepository<'AiConsents'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'AiConsents');
    }

    public async current(): Promise<AiConsent | null> {
        return this.findOne({});
    }

    public async grant(input: GrantInput): Promise<AiConsent> {
        const now: Date = new Date();
        const accepted: AcceptedValues = {
            acceptedByUserId: input.userId,
            noticeVersion: input.noticeVersion,
            source: input.source,
            grantedAt: now,
            revokedAt: null,
            revokedByUserId: null,
            updatedAt: now
        };
        return this.insertBuilder()
            .values({ id: IdUtil.newId(), companyId: this.companyId, ...accepted })
            .onConflict((conflict) => conflict.column('companyId').where('deletedAt', 'is', null).doUpdateSet(accepted))
            .returningAll()
            .executeTakeFirstOrThrow();
    }

    public async revoke(userId: string | null): Promise<number> {
        const rows: AiConsent[] = await this.updateManyRows({ revokedAt: null }, { revokedAt: new Date(), revokedByUserId: userId });
        return rows.length;
    }

    public async eraseAll(): Promise<number> {
        return this.hardDeleteWhere({}, ERASE_BATCH);
    }
}
