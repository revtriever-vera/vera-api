import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { ACCOUNT_LIST_LIMIT, FinancialAccount, NewFinancialAccount } from '../domain/transactions.types';

type CreateAccountData = Pick<NewFinancialAccount, 'kind' | 'name' | 'institutionName' | 'numberLast4' | 'currency' | 'isSample'>;
type UpsertProviderData = Pick<
    NewFinancialAccount,
    'kind' | 'name' | 'institutionName' | 'numberLast4' | 'currency' | 'provider' | 'externalId' | 'isSample'
>;

@Injectable()
export class FinancialAccountsRepository extends TenantRepository<'FinancialAccounts'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'FinancialAccounts');
    }

    public async create(data: CreateAccountData): Promise<FinancialAccount> {
        return this.createRow({ id: IdUtil.newId(), companyId: this.companyId, ...data });
    }

    public async upsertProvider(data: UpsertProviderData): Promise<FinancialAccount> {
        return this.db
            .insertInto('FinancialAccounts')
            .values({ id: IdUtil.newId(), companyId: this.companyId, ...data })
            .onConflict((conflict) =>
                conflict
                    .columns(['companyId', 'provider', 'externalId'])
                    .where('externalId', 'is not', null)
                    .where('deletedAt', 'is', null)
                    .doUpdateSet({
                        kind: data.kind,
                        institutionName: data.institutionName ?? null,
                        numberLast4: data.numberLast4 ?? null,
                        currency: data.currency,
                        updatedAt: new Date()
                    })
            )
            .returningAll()
            .executeTakeFirstOrThrow();
    }

    public async findByIds(ids: readonly string[]): Promise<FinancialAccount[]> {
        return this.findManyWhereIn('id', ids);
    }

    public async listAll(): Promise<FinancialAccount[]> {
        return this.findMany({}, { limit: ACCOUNT_LIST_LIMIT, orderBy: [{ property: 'createdAt', direction: 'asc' }] });
    }

    public async countActive(): Promise<number> {
        const row: { total: string | number | bigint } | undefined = await this.db
            .selectFrom('FinancialAccounts')
            .select((builder) => builder.fn.countAll().as('total'))
            .where('companyId', '=', this.companyId)
            .where('deletedAt', 'is', null)
            .executeTakeFirst();
        return Number(row?.total ?? 0);
    }

    public async lockById(id: string): Promise<FinancialAccount | null> {
        const row: FinancialAccount | undefined = await this.db
            .selectFrom('FinancialAccounts')
            .selectAll()
            .where('companyId', '=', this.companyId)
            .where('deletedAt', 'is', null)
            .where('id', '=', id)
            .forUpdate()
            .executeTakeFirst();
        return row ?? null;
    }

    public async rename(id: string, name: string): Promise<FinancialAccount | null> {
        return this.updateRow(id, { name });
    }

    public async softDeleteMany(ids: readonly string[]): Promise<FinancialAccount[]> {
        return this.updateManyRows({ id: [...ids] }, { deletedAt: new Date() });
    }
}
