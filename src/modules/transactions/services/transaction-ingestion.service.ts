import { Injectable } from '@nestjs/common';
import { HmacPort } from '../../../core/crypto/hmac.port';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import { CandidatePool } from '../domain/cross-source-matcher';
import { chunkOf } from '../domain/collections';
import { FinancialAccountDomain } from '../domain/financial-account.domain';
import { Decision, PlannedItem, PlanContext, RowCandidate, isFileSource, plan, toCandidate } from '../domain/ingestion-planner';
import { TransactionDomain } from '../domain/transaction.domain';
import { compareByDateAndExternalId, isIngestible, prepare, PreparationTools } from '../domain/transaction-preparer';
import {
    CATEGORY_ORIGINS,
    CategorizationOutcome,
    FinancialAccount,
    INGESTION_CHUNK_SIZE,
    IngestionBatch,
    IncomingTransaction,
    IngestionResult,
    NewTransaction,
    PreparedTransaction,
    TRANSACTION_SOURCES,
    Transaction,
    TransactionPatch,
    TransactionSource
} from '../domain/transactions.types';
import { DescriptionNormalizerService } from '../../spending-categories/services/description-normalizer.service';
import { TransactionCategorizerService } from '../../spending-categories/services/transaction-categorizer.service';
import { TransactionsLogService } from './transactions-log.service';
import { TransactionsMetricsService } from './transactions-metrics.service';

export type { IngestionBatch, IngestionResult };

interface PreparedBatch {
    readonly items: PreparedTransaction[];
    readonly rejected: number;
    readonly duplicates: number;
}

interface CategoryFields {
    readonly categoryId: string | null;
    readonly categorySource: string;
    readonly ruleId: string | null;
}

type Counter = keyof IngestionResult;

type ContentColumn =
    | 'date'
    | 'amountMinor'
    | 'description'
    | 'normalizedDescription'
    | 'counterpartyName'
    | 'counterpartyKey'
    | 'providerCategoryId'
    | 'installmentNumber'
    | 'installmentTotal';

const EMPTY_RESULT: IngestionResult = { inserted: 0, updated: 0, unchanged: 0, duplicates: 0, superseded: 0, rejected: 0 };
const UNCATEGORIZED: CategorizationOutcome = { categoryId: null, source: CATEGORY_ORIGINS.none, ruleId: null };

function bump(result: IngestionResult, counter: Counter, amount: number = 1): IngestionResult {
    return { ...result, [counter]: result[counter] + amount };
}

function merge(left: IngestionResult, right: IngestionResult): IngestionResult {
    return {
        inserted: left.inserted + right.inserted,
        updated: left.updated + right.updated,
        unchanged: left.unchanged + right.unchanged,
        duplicates: left.duplicates + right.duplicates,
        superseded: left.superseded + right.superseded,
        rejected: left.rejected + right.rejected
    };
}

@Injectable()
export class TransactionIngestionService {
    private readonly tools: PreparationTools;

    public constructor(
        private readonly accounts: FinancialAccountDomain,
        private readonly transactions: TransactionDomain,
        private readonly categorizer: TransactionCategorizerService,
        normalizer: DescriptionNormalizerService,
        hmac: HmacPort,
        private readonly logs: TransactionsLogService,
        private readonly metrics: TransactionsMetricsService
    ) {
        this.tools = {
            normalize: (text: string): string => normalizer.normalize(text),
            hashDocument: (digits: string): string => hmac.sha256Hex(`doc:${digits}`)
        };
    }

    public async ingest(batch: IngestionBatch): Promise<IngestionResult> {
        const startedAt: number = Date.now();
        const account: FinancialAccount = await this.accounts.require(batch.accountId);
        const prepared: PreparedBatch = this.prepareBatch(batch.items);
        let total: IngestionResult = { ...EMPTY_RESULT, rejected: prepared.rejected, duplicates: prepared.duplicates };
        for (const chunk of chunkOf(prepared.items, INGESTION_CHUNK_SIZE)) {
            total = merge(total, await this.ingestChunk(batch, account, chunk));
        }
        this.metrics.ingested(batch.source, total);
        this.logs.ingested(batch.source, account.id, total, Date.now() - startedAt);
        return total;
    }

    private prepareBatch(incoming: IngestionBatch['items']): PreparedBatch {
        const valid: IncomingTransaction[] = incoming.filter(isIngestible);
        const unique: Map<string, PreparedTransaction> = new Map<string, PreparedTransaction>();
        for (const item of valid) {
            if (!unique.has(item.externalId)) {
                unique.set(item.externalId, prepare(item, this.tools));
            }
        }
        return {
            items: [...unique.values()].sort(compareByDateAndExternalId),
            rejected: incoming.length - valid.length,
            duplicates: valid.length - unique.size
        };
    }

    @UsingTransaction()
    private async ingestChunk(
        batch: IngestionBatch,
        account: FinancialAccount,
        items: readonly PreparedTransaction[]
    ): Promise<IngestionResult> {
        await this.accounts.lock(account.id);
        const context: PlanContext = await this.loadContext(batch.source, account.id, items);
        const planned: PlannedItem[] = plan(items, context);
        const outcomes: Map<string, CategorizationOutcome> = await this.categorize(planned);
        return this.write(batch, account, planned, outcomes);
    }

    private async loadContext(source: TransactionSource, accountId: string, items: readonly PreparedTransaction[]): Promise<PlanContext> {
        const externalIds: string[] = items.map((item: PreparedTransaction): string => item.externalId);
        const existing: Transaction[] = await this.transactions.findByExternalIds(accountId, externalIds);
        const absorbing: Transaction[] = isFileSource(source) ? await this.transactions.findAbsorbing(accountId, externalIds) : [];
        const candidates: Transaction[] = await this.loadCandidates(source, accountId, items);
        return {
            source,
            existing: new Map<string, Transaction>(existing.map((row: Transaction): [string, Transaction] => [row.externalId, row])),
            absorbedIds: new Set<string>(
                absorbing.flatMap((row: Transaction): string[] => (row.absorbedExternalId === null ? [] : [row.absorbedExternalId]))
            ),
            pool: new CandidatePool<RowCandidate>(candidates.map(toCandidate)),
            newId: (): string => this.transactions.newId()
        };
    }

    private async loadCandidates(
        source: TransactionSource,
        accountId: string,
        items: readonly PreparedTransaction[]
    ): Promise<Transaction[]> {
        const first: string | undefined = items[0]?.date;
        const last: string | undefined = items[items.length - 1]?.date;
        if (first === undefined || last === undefined) {
            return [];
        }
        if (source === TRANSACTION_SOURCES.pluggy) {
            return this.transactions.fileRows(accountId, first, last);
        }
        return isFileSource(source) ? this.transactions.unabsorbedProviderRows(accountId, first, last) : [];
    }

    private async categorize(planned: readonly PlannedItem[]): Promise<Map<string, CategorizationOutcome>> {
        const pending: PreparedTransaction[] = planned
            .filter((entry: PlannedItem): boolean => this.needsCategory(entry))
            .map((entry: PlannedItem): PreparedTransaction => entry.item);
        const results: readonly CategorizationOutcome[] = await this.categorizer.categorizeMany(
            pending.map((item: PreparedTransaction) => ({
                amountMinor: item.amountMinor,
                normalizedDescription: item.normalizedDescription,
                counterpartyKey: item.counterpartyKey,
                providerCategoryId: item.providerCategoryId
            }))
        );
        return new Map<string, CategorizationOutcome>(
            pending.map((item: PreparedTransaction, index: number): [string, CategorizationOutcome] => [
                item.externalId,
                results[index] ?? UNCATEGORIZED
            ])
        );
    }

    private needsCategory(entry: PlannedItem): boolean {
        const decision: Decision = entry.decision;
        if (decision.kind === 'insert') {
            return true;
        }
        if (decision.kind === 'supersede') {
            return decision.file.categorySource !== CATEGORY_ORIGINS.user;
        }
        return decision.kind === 'update' && decision.recategorize;
    }

    private async write(
        batch: IngestionBatch,
        account: FinancialAccount,
        planned: readonly PlannedItem[],
        outcomes: ReadonlyMap<string, CategorizationOutcome>
    ): Promise<IngestionResult> {
        const rows: NewTransaction[] = planned.flatMap((entry: PlannedItem): NewTransaction[] =>
            this.newRow(batch, account, entry, outcomes)
        );
        await this.transactions.assertRoomFor(rows.length);
        const inserted: Set<string> = new Set<string>(await this.transactions.insertMany(rows));
        let result: IngestionResult = EMPTY_RESULT;
        for (const entry of planned) {
            result = bump(result, await this.apply(batch, entry, inserted, outcomes));
        }
        return result;
    }

    private newRow(
        batch: IngestionBatch,
        account: FinancialAccount,
        entry: PlannedItem,
        outcomes: ReadonlyMap<string, CategorizationOutcome>
    ): NewTransaction[] {
        const decision: Decision = entry.decision;
        if (decision.kind !== 'insert' && decision.kind !== 'supersede') {
            return [];
        }
        const superseding: Transaction | null = decision.kind === 'supersede' ? decision.file : null;
        return [
            {
                ...this.contentColumns(entry.item),
                ...this.categoryFields(entry, outcomes),
                ...this.provenance(batch, account, superseding),
                id: decision.id,
                externalId: entry.item.externalId
            }
        ];
    }

    private provenance(
        batch: IngestionBatch,
        account: FinancialAccount,
        superseding: Transaction | null
    ): Pick<
        NewTransaction,
        'companyId' | 'accountId' | 'source' | 'currency' | 'importId' | 'absorbedExternalId' | 'absorbedImportId' | 'isSample'
    > {
        return {
            companyId: account.companyId,
            accountId: account.id,
            source: batch.source,
            currency: account.currency,
            importId: batch.importId ?? null,
            absorbedExternalId: superseding?.externalId ?? null,
            absorbedImportId: superseding?.importId ?? null,
            isSample: batch.isSample ?? batch.source === TRANSACTION_SOURCES.sample
        };
    }

    private contentColumns(item: PreparedTransaction): Pick<NewTransaction, ContentColumn> {
        return {
            date: item.date,
            amountMinor: item.amountMinor,
            description: item.description,
            normalizedDescription: item.normalizedDescription,
            counterpartyName: item.counterpartyName,
            counterpartyKey: item.counterpartyKey,
            providerCategoryId: item.providerCategoryId,
            installmentNumber: item.installmentNumber,
            installmentTotal: item.installmentTotal
        };
    }

    private categoryFields(entry: PlannedItem, outcomes: ReadonlyMap<string, CategorizationOutcome>): CategoryFields {
        const decision: Decision = entry.decision;
        if (decision.kind === 'supersede' && decision.file.categorySource === CATEGORY_ORIGINS.user) {
            return { categoryId: decision.file.categoryId, categorySource: CATEGORY_ORIGINS.user, ruleId: decision.file.ruleId };
        }
        const outcome: CategorizationOutcome = outcomes.get(entry.item.externalId) ?? UNCATEGORIZED;
        return { categoryId: outcome.categoryId, categorySource: outcome.source, ruleId: outcome.ruleId };
    }

    private async apply(
        batch: IngestionBatch,
        entry: PlannedItem,
        inserted: ReadonlySet<string>,
        outcomes: ReadonlyMap<string, CategorizationOutcome>
    ): Promise<Counter> {
        const decision: Decision = entry.decision;
        const item: PreparedTransaction = entry.item;
        if (decision.kind === 'absorb') {
            await this.transactions.markAbsorbed(decision.target.id, item.externalId, batch.importId ?? null);
            return 'duplicates';
        }
        if (decision.kind === 'update') {
            await this.update(decision.row, item, outcomes.get(item.externalId));
            return 'updated';
        }
        if (decision.kind === 'supersede' && inserted.has(item.externalId)) {
            await this.transactions.markSuperseded(decision.file.id, decision.id);
            return 'superseded';
        }
        if (decision.kind === 'insert' && inserted.has(item.externalId)) {
            return 'inserted';
        }
        return this.alreadyThere(batch, decision) ? 'duplicates' : 'unchanged';
    }

    private alreadyThere(batch: IngestionBatch, decision: Decision): boolean {
        return decision.kind === 'duplicate' || (decision.kind === 'unchanged' && isFileSource(batch.source));
    }

    private async update(row: Transaction, item: PreparedTransaction, outcome: CategorizationOutcome | undefined): Promise<void> {
        const category: Pick<TransactionPatch, 'categoryId' | 'categorySource' | 'ruleId'> =
            outcome === undefined ? {} : { categoryId: outcome.categoryId, categorySource: outcome.source, ruleId: outcome.ruleId };
        await this.transactions.patch(row.id, { ...this.contentColumns(item), ...category });
    }
}
