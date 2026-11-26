import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { JsonObject } from '../../../core/llm/llm.types';
import { AppLocale } from '../../../shared/i18n/locale';
import { categoryLabelOf, categoryOfKey } from '../../ai-assistant/services/category-key.resolver';
import { ActionCandidate, ActionChoice } from '../../assistant-chat/services/assistant-action-executor.port';
import { ActionChoiceInvalidError, ConfirmationStaleError } from '../../assistant-chat/services/assistant-action.errors';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { CategoryReaderService, SpendingCategory } from '../../spending-categories/services/category-reader.service';
import { DescriptionNormalizerService } from '../../spending-categories/services/description-normalizer.service';
import { addDays } from '../domain/calendar';
import { TransactionDomain } from '../domain/transaction.domain';
import { categorizedText, proposalSummary } from '../domain/transaction-assistant-texts';
import { TransactionNotFoundError } from '../domain/transactions.errors';
import { DIRECTIONS, RULE_SCOPES, Transaction, TransactionFilter, TransactionView } from '../domain/transactions.types';
import {
    TransactionCategorizeInput,
    TransactionProposalPayload,
    transactionProposalPayloadSchema
} from '../validation/transaction-proposal.schemas';
import { RecategorizedView, TransactionRecategorizeService } from './transaction-recategorize.service';
import { TransactionViewService } from './transaction-view.service';

const LOOKBACK_DAYS: number = 90;
const CANDIDATE_LIMIT: number = 10;

export type TransactionProposal =
    | { readonly status: 'proposed'; readonly summary: string; readonly payload: JsonObject }
    | { readonly status: 'unknown_category' | 'no_transactions' };

@Injectable()
export class TransactionAssistantService {
    public constructor(
        private readonly transactions: TransactionDomain,
        private readonly categories: CategoryReaderService,
        private readonly recategorization: TransactionRecategorizeService,
        private readonly views: TransactionViewService,
        private readonly timezones: CompanyTimezoneService,
        private readonly normalizer: DescriptionNormalizerService,
        private readonly context: AppContext
    ) {}

    public async propose(input: TransactionCategorizeInput): Promise<TransactionProposal> {
        const locale: AppLocale = this.context.get().locale;
        const category: SpendingCategory | null = categoryOfKey(await this.categories.listForCompany(), input.categoryKey, locale);
        if (category === null) {
            return { status: 'unknown_category' };
        }
        const payload: TransactionProposalPayload = {
            categoryId: category.id,
            always: input.always === true,
            search: input.search ?? null
        };
        if ((await this.rowsFor(payload, category)).length === 0) {
            return { status: 'no_transactions' };
        }
        return { status: 'proposed', summary: proposalSummary(categoryLabelOf(category, locale), payload.always, locale), payload };
    }

    public async stateOf(payload: JsonObject): Promise<string> {
        const parsed: TransactionProposalPayload = transactionProposalPayloadSchema.parse(payload);
        const categories: readonly SpendingCategory[] = await this.categories.listForCompany();
        const category: SpendingCategory | undefined = categories.find(
            (candidate: SpendingCategory): boolean => candidate.id === parsed.categoryId
        );
        return category === undefined
            ? 'missing'
            : `${category.id}:${categoryLabelOf(category, this.context.get().locale)}:${category.kind}`;
    }

    public alwaysOf(payload: JsonObject): boolean {
        return transactionProposalPayloadSchema.parse(payload).always;
    }

    public async candidates(payload: JsonObject): Promise<readonly ActionCandidate[]> {
        const parsed: TransactionProposalPayload = transactionProposalPayloadSchema.parse(payload);
        const rows: Transaction[] = await this.rowsFor(parsed, await this.categories.requireById(parsed.categoryId));
        const views: TransactionView[] = await this.views.of(rows);
        return rows.map((row: Transaction, index: number): ActionCandidate => {
            const view: TransactionView | undefined = views[index];
            return {
                id: row.id,
                version: row.updatedAt.toISOString(),
                date: view?.date ?? '',
                description: view?.description ?? '',
                amountMinor: view?.amountMinor ?? 0,
                currency: row.currency,
                accountName: view?.accountName ?? ''
            };
        });
    }

    public async categorize(payload: JsonObject, choice: ActionChoice | null): Promise<string> {
        const parsed: TransactionProposalPayload = transactionProposalPayloadSchema.parse(payload);
        if (choice?.transactionId === undefined || choice.version === undefined) {
            throw new ActionChoiceInvalidError('transaction_required');
        }
        const current: Transaction = await this.pickedOf(choice.transactionId, choice.version);
        const category: SpendingCategory = await this.categories.requireById(parsed.categoryId);
        const always: boolean = choice.always ?? parsed.always;
        const scope: 'counterparty' | 'description' = current.counterpartyKey === null ? RULE_SCOPES.description : RULE_SCOPES.counterparty;
        const result: RecategorizedView = await this.recategorization.recategorize(current.id, {
            categoryId: category.id,
            rule: always ? { scope } : null
        });
        return categorizedText(
            categoryLabelOf(category, this.context.get().locale),
            result.recategorized,
            always,
            this.context.get().locale
        );
    }

    private async pickedOf(id: string, version: string): Promise<Transaction> {
        try {
            const current: Transaction = await this.transactions.require(id);
            if (current.updatedAt.toISOString() !== version) {
                throw new ConfirmationStaleError();
            }
            return current;
        } catch (error: unknown) {
            throw error instanceof TransactionNotFoundError ? new ConfirmationStaleError() : error;
        }
    }

    private async rowsFor(payload: TransactionProposalPayload, category: SpendingCategory): Promise<Transaction[]> {
        const today: string = await this.timezones.todayInCompany();
        const search: string | undefined = payload.search === null ? undefined : this.searchOf(payload.search);
        const filter: TransactionFilter = {
            fromDate: addDays(today, -LOOKBACK_DAYS),
            toDate: today,
            direction: category.kind === 'income' ? DIRECTIONS.in : DIRECTIONS.out,
            search
        };
        const rows: Transaction[] = await this.transactions.listPage(filter, 1, CANDIDATE_LIMIT * 2);
        return rows.filter((row: Transaction): boolean => row.categoryId !== category.id).slice(0, CANDIDATE_LIMIT);
    }

    private searchOf(text: string): string {
        const normalized: string = this.normalizer.normalize(text);
        return normalized.length > 0 ? normalized : text.trim();
    }
}
