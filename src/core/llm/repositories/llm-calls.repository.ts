import { Injectable } from '@nestjs/common';
import { AppContext } from '../../context/app-context.port';
import { DatabaseClient } from '../../database/database.client';
import { TenantRepository } from '../../database/repositories/tenant.repository';
import { LlmCall, NewLlmCall } from '../llm-calls.types';

const PURGE_BATCH: number = 500;

@Injectable()
export class LlmCallsRepository extends TenantRepository<'LlmCalls'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'LlmCalls');
    }

    public async insertCall(call: Omit<NewLlmCall, 'companyId'>): Promise<LlmCall> {
        return this.createRow({ ...call, companyId: this.companyId });
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

    public async eraseAll(): Promise<number> {
        return this.hardDeleteWhere({}, PURGE_BATCH);
    }

    public async purgeBefore(cutoff: Date): Promise<number> {
        let purged: number = 0;
        let removed: number = await this.hardDeleteBefore('createdAt', cutoff, PURGE_BATCH);
        while (removed > 0) {
            purged += removed;
            removed = await this.hardDeleteBefore('createdAt', cutoff, PURGE_BATCH);
        }
        return purged;
    }
}
