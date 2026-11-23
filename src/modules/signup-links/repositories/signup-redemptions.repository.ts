import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareTenantRepository } from '../../../core/database/repositories/bare-tenant.repository';
import { NewSignupRedemption, SignupRedemption } from '../domain/signup-links.types';

type CreateData = Pick<
    NewSignupRedemption,
    'id' | 'signupLinkId' | 'source' | 'trialKind' | 'trialDays' | 'rules' | 'redeemedAt' | 'expiresAt' | 'trialStartedAt'
>;

@Injectable()
export class SignupRedemptionsRepository extends BareTenantRepository<'SignupRedemptions'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'SignupRedemptions');
    }

    public async current(): Promise<SignupRedemption | null> {
        return this.findOne({});
    }

    public async createOnce(data: CreateData): Promise<SignupRedemption | null> {
        const row: SignupRedemption | undefined = await this.insertBuilder()
            .values({ ...data, companyId: this.companyId })
            .onConflict((conflict) => conflict.column('companyId').doNothing())
            .returningAll()
            .executeTakeFirst();
        return row ?? null;
    }

    public async markApplied(at: Date): Promise<boolean> {
        const rows: SignupRedemption[] = await this.updateManyRows({ appliedAt: null }, { appliedAt: at, updatedAt: at });
        return rows.length > 0;
    }
}
