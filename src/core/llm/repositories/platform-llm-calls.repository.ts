import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../database/database.client';
import { GlobalRepository } from '../../database/repositories/global.repository';
import { LlmCall, NewLlmCall } from '../llm-calls.types';

@Injectable()
export class PlatformLlmCallsRepository extends GlobalRepository<'LlmCalls'> {
    public constructor(database: DatabaseClient) {
        super(database, 'LlmCalls');
    }

    public async insertCall(call: Omit<NewLlmCall, 'companyId'>): Promise<LlmCall> {
        return this.createRow({ ...call, companyId: null });
    }

    public async countAnsweredSince(requestHash: string, since: Date): Promise<number> {
        const row: { total: string } | undefined = await this.selectScoped()
            .select((eb) => eb.fn.countAll<string>().as('total'))
            .where('requestHash', '=', requestHash)
            .where('outcome', '=', 'answered')
            .where('createdAt', '>=', since)
            .executeTakeFirst();
        return Number(row?.total ?? 0);
    }

    public async costSince(feature: string, since: Date): Promise<number> {
        const row: { total: string | null } | undefined = await this.selectScoped()
            .select((eb) => eb.fn.sum<string>('costMicros').as('total'))
            .where('feature', '=', feature)
            .where('createdAt', '>=', since)
            .executeTakeFirst();
        return Number(row?.total ?? 0);
    }

    protected override scopeFilter(): Record<string, unknown> {
        return { deletedAt: null, companyId: null };
    }
}
