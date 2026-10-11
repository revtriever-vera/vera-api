import { Injectable } from '@nestjs/common';
import { Expression, ExpressionBuilder, RawBuilder, SelectQueryBuilder, SqlBool, sql } from 'kysely';
import { AppContext } from '../../../core/context/app-context.port';
import { DatabaseClient } from '../../../core/database/database.client';
import { DB } from '../../../core/database/generated/database.types';
import { TenantRepository } from '../../../core/database/repositories/tenant.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { firstDayOf, lastDayOf } from '../domain/calendar';
import {
    AccountStats,
    BASE_CURRENCY,
    CategorizationOutcome,
    DIRECTIONS,
    FILE_SOURCES,
    MonthlyCategoryNet,
    MonthRange,
    NewTransaction,
    TRANSACTION_SOURCES,
    Transaction,
    TransactionFilter,
    TransactionPatch,
    TransactionTotals
} from '../domain/transactions.types';
import { toDateString } from '../domain/transaction.mapper';

type TransactionsDb = Pick<DB, 'Transactions'>;
type TransactionsQuery<O> = SelectQueryBuilder<TransactionsDb, 'Transactions', O>;
type TransactionsBuilder = ExpressionBuilder<TransactionsDb, 'Transactions'>;

export type RowSelection =
    | { readonly kind: 'matcher'; readonly matchType: string; readonly pattern: string; readonly appliesTo: string }
    | { readonly kind: 'rule'; readonly ruleId: string }
    | { readonly kind: 'category'; readonly categoryId: string };

export interface ExportCursor {
    readonly date: string;
    readonly id: string;
}

const LIKE_SPECIALS: RegExp = /[\\%_]/g;

function likePattern(text: string): string {
    return `%${text.replace(LIKE_SPECIALS, '\\$&')}%`;
}

function numeric(value: unknown): number {
    return Number(value ?? 0);
}

@Injectable()
export class TransactionsRepository extends TenantRepository<'Transactions'> {
    public constructor(database: DatabaseClient, context: AppContext) {
        super(database, context, 'Transactions');
    }

    public async findByExternalIds(accountId: string, externalIds: readonly string[]): Promise<Transaction[]> {
        if (externalIds.length === 0) {
            return [];
        }
        return this.scopedSelect().selectAll().where('accountId', '=', accountId).where('externalId', 'in', externalIds).execute();
    }

    public async findAbsorbing(accountId: string, externalIds: readonly string[]): Promise<Transaction[]> {
        if (externalIds.length === 0) {
            return [];
        }
        return this.scopedSelect().selectAll().where('accountId', '=', accountId).where('absorbedExternalId', 'in', externalIds).execute();
    }

    public async listUnabsorbedProviderRows(accountId: string, fromDate: string, toDate: string): Promise<Transaction[]> {
        return this.inDateRange(this.scopedSelect().selectAll(), fromDate, toDate)
            .where('accountId', '=', accountId)
            .where('source', '=', TRANSACTION_SOURCES.pluggy)
            .where('absorbedExternalId', 'is', null)
            .execute();
    }

    public async listFileRows(accountId: string, fromDate: string, toDate: string): Promise<Transaction[]> {
        return this.inDateRange(this.scopedSelect().selectAll(), fromDate, toDate)
            .where('accountId', '=', accountId)
            .where('source', 'in', FILE_SOURCES)
            .execute();
    }

    public async insertManyIfAbsent(rows: readonly NewTransaction[]): Promise<string[]> {
        if (rows.length === 0) {
            return [];
        }
        const inserted: { externalId: string }[] = await this.db
            .insertInto('Transactions')
            .values(rows.map((row: NewTransaction): NewTransaction => ({ ...row, companyId: this.companyId })))
            .onConflict((conflict) => conflict.columns(['companyId', 'accountId', 'externalId']).where('deletedAt', 'is', null).doNothing())
            .returning('externalId')
            .execute();
        return inserted.map((row: { externalId: string }): string => row.externalId);
    }

    public async patch(id: string, patch: TransactionPatch): Promise<Transaction | null> {
        return this.updateRow(id, patch);
    }

    public async markSuperseded(id: string, supersededById: string): Promise<Transaction | null> {
        return this.updateRow(id, { deletedAt: new Date(), supersededById });
    }

    public async markAbsorbed(id: string, absorbedExternalId: string, absorbedImportId: string | null): Promise<Transaction | null> {
        return this.updateRow(id, { absorbedExternalId, absorbedImportId });
    }

    public async countActive(): Promise<number> {
        const row: { total: string | number | bigint } | undefined = await this.scopedSelect()
            .select((builder) => builder.fn.countAll().as('total'))
            .executeTakeFirst();
        return numeric(row?.total);
    }

    public async countUncategorizedOutgoing(): Promise<number> {
        const row: { total: string | number | bigint } | undefined = await this.scopedSelect()
            .select((builder) => builder.fn.countAll().as('total'))
            .where('categoryId', 'is', null)
            .where('amountMinor', '<', '0')
            .where('isSample', '=', false)
            .executeTakeFirst();
        return numeric(row?.total);
    }

    public async listPage(filter: TransactionFilter, page: number, pageSize: number): Promise<Transaction[]> {
        return this.filtered(this.scopedSelect().selectAll(), filter)
            .orderBy('date', 'desc')
            .orderBy('id', 'desc')
            .limit(pageSize)
            .offset((page - 1) * pageSize)
            .execute();
    }

    public async listAfter(filter: TransactionFilter, cursor: ExportCursor | null, size: number): Promise<Transaction[]> {
        const query: TransactionsQuery<Transaction> = this.filtered(this.scopedSelect().selectAll(), filter);
        const ordered: TransactionsQuery<Transaction> = cursor === null ? query : query.where((eb) => this.afterCursor(eb, cursor));
        return ordered.orderBy('date', 'asc').orderBy('id', 'asc').limit(size).execute();
    }

    public async totals(filter: TransactionFilter): Promise<TransactionTotals> {
        const row: { count: unknown; inMinor: unknown; outMinor: unknown } | undefined = await this.filtered(this.scopedSelect(), filter)
            .select((eb) => [
                eb.fn.countAll().as('count'),
                eb.fn.sum(eb.case().when('amountMinor', '>', '0').then(eb.ref('amountMinor')).else('0').end()).as('inMinor'),
                eb.fn.sum(eb.case().when('amountMinor', '<', '0').then(eb.ref('amountMinor')).else('0').end()).as('outMinor')
            ])
            .executeTakeFirst();
        return { count: numeric(row?.count), inMinor: numeric(row?.inMinor), outMinor: numeric(row?.outMinor) };
    }

    public async statsByAccount(accountIds: readonly string[]): Promise<AccountStats[]> {
        if (accountIds.length === 0) {
            return [];
        }
        const rows: { accountId: string; total: unknown; lastDate: Date | null }[] = await this.scopedSelect()
            .select((eb) => ['accountId', eb.fn.countAll().as('total'), eb.fn.max('date').as('lastDate')])
            .where('accountId', 'in', accountIds)
            .groupBy('accountId')
            .execute();
        return rows.map((row: { accountId: string; total: unknown; lastDate: Date | null }): AccountStats => ({
            accountId: row.accountId,
            transactionCount: numeric(row.total),
            lastTransactionDate: row.lastDate === null ? null : toDateString(row.lastDate)
        }));
    }

    public async monthlyNetByCategory(range: MonthRange): Promise<MonthlyCategoryNet[]> {
        const month: RawBuilder<string> = sql<string>`to_char("date", 'YYYY-MM')`;
        const rows: { month: string; categoryId: string | null; net: unknown }[] = await this.inMonths(this.scopedSelect(), range)
            .select((eb) => [month.as('month'), 'categoryId', eb.fn.sum('amountMinor').as('net')])
            .where('currency', '=', BASE_CURRENCY)
            .groupBy([month, 'categoryId'])
            .orderBy(month)
            .execute();
        return rows.map((row: { month: string; categoryId: string | null; net: unknown }): MonthlyCategoryNet => ({
            month: row.month,
            categoryId: row.categoryId,
            netMinor: numeric(row.net)
        }));
    }

    public async monthsWithData(range: MonthRange): Promise<string[]> {
        const month: RawBuilder<string> = sql<string>`to_char("date", 'YYYY-MM')`;
        const rows: { month: string }[] = await this.inMonths(this.scopedSelect(), range)
            .select(month.as('month'))
            .where('currency', '=', BASE_CURRENCY)
            .distinct()
            .orderBy(month)
            .execute();
        return rows.map((row: { month: string }): string => row.month);
    }

    public async countOtherCurrencies(month: string): Promise<number> {
        const row: { total: unknown } | undefined = await this.inMonths(this.scopedSelect(), { fromMonth: month, toMonth: month })
            .select((eb) => eb.fn.countAll().as('total'))
            .where('currency', '<>', BASE_CURRENCY)
            .executeTakeFirst();
        return numeric(row?.total);
    }

    public async softDeleteByAccounts(accountIds: readonly string[]): Promise<number> {
        const removed: Transaction[] = await this.updateManyRows({ accountId: [...accountIds] }, { deletedAt: new Date() });
        return removed.length;
    }

    public async softDeleteByImport(importId: string): Promise<number> {
        const removed: Transaction[] = await this.updateManyRows({ importId }, { deletedAt: new Date() });
        return removed.length;
    }

    public async clearAbsorbedByImport(importId: string): Promise<number> {
        const cleared: Transaction[] = await this.updateManyRows(
            { absorbedImportId: importId },
            { absorbedExternalId: null, absorbedImportId: null }
        );
        return cleared.length;
    }

    public async selectBatch(selection: RowSelection, afterId: string | null, size: number, includeUser: boolean): Promise<Transaction[]> {
        const query: TransactionsQuery<Transaction> = this.selected(this.scopedSelect().selectAll(), selection, includeUser);
        const paged: TransactionsQuery<Transaction> = afterId === null ? query : query.where('id', '>', afterId);
        return paged.orderBy('id').limit(size).execute();
    }

    public async countSelection(selection: RowSelection, includeUser: boolean): Promise<number> {
        const row: { total: unknown } | undefined = await this.selected(this.scopedSelect(), selection, includeUser)
            .select((eb) => eb.fn.countAll().as('total'))
            .executeTakeFirst();
        return numeric(row?.total);
    }

    public async applyOutcome(ids: readonly string[], outcome: CategorizationOutcome): Promise<number> {
        const updated: Transaction[] = await this.updateManyRows(
            { id: [...ids] },
            { categoryId: outcome.categoryId, categorySource: outcome.source, ruleId: outcome.ruleId }
        );
        return updated.length;
    }

    public async moveCategory(ids: readonly string[], categoryId: string): Promise<number> {
        const updated: Transaction[] = await this.updateManyRows({ id: [...ids] }, { categoryId, ruleId: null });
        return updated.length;
    }

    public newId(): string {
        return IdUtil.newId();
    }

    private scopedSelect(): TransactionsQuery<object> {
        return this.db
            .selectFrom('Transactions')
            .where('Transactions.companyId', '=', this.companyId)
            .where('Transactions.deletedAt', 'is', null);
    }

    private inDateRange<O>(query: TransactionsQuery<O>, fromDate: string, toDate: string): TransactionsQuery<O> {
        return query.where((eb) => eb.and([eb('date', '>=', this.day(eb, fromDate)), eb('date', '<=', this.day(eb, toDate))]));
    }

    private inMonths<O>(query: TransactionsQuery<O>, range: MonthRange): TransactionsQuery<O> {
        return this.inDateRange(query, firstDayOf(range.fromMonth), lastDayOf(range.toMonth));
    }

    private day(eb: TransactionsBuilder, value: string): Expression<Date> {
        return eb.cast<Date>(eb.val(value), 'date');
    }

    private afterCursor(eb: TransactionsBuilder, cursor: ExportCursor): Expression<SqlBool> {
        const day: Expression<Date> = this.day(eb, cursor.date);
        return eb.or([eb('date', '>', day), eb.and([eb('date', '=', day), eb('id', '>', cursor.id)])]);
    }

    private filtered<O>(query: TransactionsQuery<O>, filter: TransactionFilter): TransactionsQuery<O> {
        return this.inDateRange(query, filter.fromDate, filter.toDate).where((eb) => eb.and(this.scalarConditions(eb, filter)));
    }

    private scalarConditions(eb: TransactionsBuilder, filter: TransactionFilter): Expression<SqlBool>[] {
        const conditions: Expression<SqlBool>[] = [];
        if (filter.accountId !== undefined) {
            conditions.push(eb('accountId', '=', filter.accountId));
        }
        if (filter.categoryId !== undefined) {
            conditions.push(eb('categoryId', '=', filter.categoryId));
        }
        if (filter.uncategorized === true) {
            conditions.push(eb('categoryId', 'is', null));
        }
        return [...conditions, ...this.directionConditions(eb, filter), ...this.searchConditions(eb, filter)];
    }

    private directionConditions(eb: TransactionsBuilder, filter: TransactionFilter): Expression<SqlBool>[] {
        if (filter.direction === undefined) {
            return [];
        }
        return [filter.direction === DIRECTIONS.out ? eb('amountMinor', '<', '0') : eb('amountMinor', '>', '0')];
    }

    private searchConditions(eb: TransactionsBuilder, filter: TransactionFilter): Expression<SqlBool>[] {
        if (filter.search === undefined) {
            return [];
        }
        const pattern: string = likePattern(filter.search);
        return [eb.or([eb('normalizedDescription', 'ilike', pattern), eb('counterpartyName', 'ilike', pattern)])];
    }

    private selected<O>(query: TransactionsQuery<O>, selection: RowSelection, includeUser: boolean): TransactionsQuery<O> {
        const scoped: TransactionsQuery<O> = includeUser ? query : query.where('categorySource', '<>', 'user');
        if (selection.kind === 'rule') {
            return scoped.where('ruleId', '=', selection.ruleId);
        }
        if (selection.kind === 'category') {
            return scoped.where('categoryId', '=', selection.categoryId);
        }
        return scoped.where((eb) => eb.and(this.matcherConditions(eb, selection)));
    }

    private matcherConditions(eb: TransactionsBuilder, selection: Extract<RowSelection, { kind: 'matcher' }>): Expression<SqlBool>[] {
        const text: Expression<SqlBool> =
            selection.matchType === 'counterparty'
                ? eb('counterpartyKey', '=', selection.pattern)
                : this.descriptionCondition(eb, selection.matchType, selection.pattern);
        return [text, ...this.appliesToConditions(eb, selection.appliesTo)];
    }

    private descriptionCondition(eb: TransactionsBuilder, matchType: string, pattern: string): Expression<SqlBool> {
        return matchType === 'contains'
            ? eb('normalizedDescription', 'ilike', likePattern(pattern))
            : eb('normalizedDescription', '=', pattern);
    }

    private appliesToConditions(eb: TransactionsBuilder, appliesTo: string): Expression<SqlBool>[] {
        if (appliesTo === 'out') {
            return [eb('amountMinor', '<', '0')];
        }
        return appliesTo === 'in' ? [eb('amountMinor', '>', '0')] : [];
    }
}
