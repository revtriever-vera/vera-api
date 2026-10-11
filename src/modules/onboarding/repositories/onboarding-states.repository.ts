import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { OnboardingState, OnboardingStateUpdate } from '../domain/onboarding.types';

@Injectable()
export class OnboardingStatesRepository extends TenantRepository<'OnboardingStates'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'OnboardingStates');
    }

    public async current(): Promise<OnboardingState> {
        const existing: OnboardingState | null = await this.findOne({});
        if (existing) {
            return existing;
        }
        return this.createIfMissing();
    }

    public async stamp(id: string, patch: OnboardingStateUpdate): Promise<OnboardingState> {
        const updated: OnboardingState | null = await this.update(id, patch);
        if (updated) {
            return updated;
        }
        return this.currentOrThrow(id);
    }

    private async createIfMissing(): Promise<OnboardingState> {
        const inserted: OnboardingState | undefined = await this.db
            .insertInto('OnboardingStates')
            .values({ id: IdUtil.newId(), companyId: this.companyId })
            .onConflict((conflict) => conflict.column('companyId').where('deletedAt', 'is', null).doNothing())
            .returningAll()
            .executeTakeFirst();
        if (inserted) {
            return inserted;
        }
        return this.currentOrThrow(this.companyId);
    }

    private async currentOrThrow(reference: string): Promise<OnboardingState> {
        const row: OnboardingState | null = await this.findOne({});
        if (!row) {
            throw new Error(`OnboardingStates row missing after write for "${reference}"`);
        }
        return row;
    }
}
