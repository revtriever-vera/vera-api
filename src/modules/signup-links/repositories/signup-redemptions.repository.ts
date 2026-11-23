import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareTenantRepository } from '../../../core/database/repositories/bare-tenant.repository';
// eslint-disable-next-line local/repository-escape -- o vencimento de cada resgate é a data do resgate mais os dias do link: só se escreve em SQL
import { RawBuilder, sql } from 'kysely';
import { NewSignupRedemption, SignupLink, SignupRedemption, TRIAL_KINDS } from '../domain/signup-links.types';

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

    public async refreshUnapplied(link: SignupLink, now: Date): Promise<void> {
        if (link.trialKind !== TRIAL_KINDS.noCard) {
            await this.refreshTrial(link, now);
        }
        await this.refreshOffer(link, now);
    }

    private async refreshTrial(link: SignupLink, now: Date): Promise<void> {
        // eslint-disable-next-line local/repository-escape, no-restricted-syntax -- a edição do link vale para os resgates de todas as empresas que ainda não aplicaram a oferta
        await this.db
            .updateTable('SignupRedemptions')
            .set({ trialKind: link.trialKind, trialDays: link.trialDays, updatedAt: now })
            .where('signupLinkId', '=', link.id)
            .where('appliedAt', 'is', null)
            .where('expiresAt', '>', now)
            .where('trialStartedAt', 'is', null)
            .execute();
    }

    private async refreshOffer(link: SignupLink, now: Date): Promise<void> {
        const expiresAt: RawBuilder<Date> = sql<Date>`"redeemedAt" + (${link.offerValidityDays}::int * interval '1 day')`;
        // eslint-disable-next-line local/repository-escape, no-restricted-syntax -- a edição do link vale para os resgates de todas as empresas que ainda não aplicaram a oferta
        await this.db
            .updateTable('SignupRedemptions')
            .set({ rules: JSON.stringify(link.rules), expiresAt, updatedAt: now })
            .where('signupLinkId', '=', link.id)
            .where('appliedAt', 'is', null)
            .where('expiresAt', '>', now)
            .execute();
    }
}
