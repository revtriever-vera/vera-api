import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../../core/context/app-context.port';
import { JsonObject } from '../../../../core/llm/llm.types';
import { AppLocale } from '../../../../shared/i18n/locale';
import { CategoryReaderService } from '../../../spending-categories/services/category-reader.service';
import { MonthlyCategoryNet, TransactionAggregatesService } from '../../../transactions/services/transaction-aggregates.service';
import { CategoryKeying, keyCategories, KeyedCategory } from '../../domain/ask-category-keys';
import { monthIndexOf, monthOfIndex } from '../../domain/ask-tool-output';
import { ASK_VERA_FEATURE, ASK_VERA_TOOL_KINDS, AskVeraToolKind, AskVeraToolOutput } from '../../domain/ask-vera.types';
import { ContextFacts } from '../../domain/context/context-facts';
import { AI_SPENDING_CURRENCY } from '../../domain/context/month.context';
import { AskVeraToolPort, PaidFeature } from '../ask-vera-tool.port';
import { byCategoryInputSchema, ByCategoryInput } from '../../validation/ask-vera-tools.schemas';

function spentOf(row: MonthlyCategoryNet): number {
    return Math.max(0, -row.netMinor);
}

function spentByCategory(rows: readonly MonthlyCategoryNet[]): ReadonlyMap<string | null, ReadonlyMap<string, number>> {
    const result: Map<string | null, Map<string, number>> = new Map<string | null, Map<string, number>>();
    for (const row of rows) {
        const spent: number = spentOf(row);
        if (spent === 0) {
            continue;
        }
        const months: Map<string, number> = result.get(row.categoryId) ?? new Map<string, number>();
        months.set(row.month, (months.get(row.month) ?? 0) + spent);
        result.set(row.categoryId, months);
    }
    return result;
}

function entryOf(entry: KeyedCategory, months: readonly string[], spent: ReadonlyMap<string, number>, facts: ContextFacts): JsonObject {
    const total: number = [...spent.values()].reduce((sum: number, value: number): number => sum + value, 0);
    return {
        ...entry.assigned,
        total: facts.money(total),
        meses: months.map((value: string): JsonObject => ({ mes: value, total: facts.money(spent.get(value) ?? 0) }))
    };
}

@Injectable()
export class SpendingByCategoryTool extends AskVeraToolPort {
    public readonly name: string = 'spending_by_category';
    public readonly feature: PaidFeature = ASK_VERA_FEATURE;
    public readonly kind: AskVeraToolKind = ASK_VERA_TOOL_KINDS.read;
    public readonly inputSchema: typeof byCategoryInputSchema = byCategoryInputSchema;

    public constructor(
        private readonly categories: CategoryReaderService,
        private readonly aggregates: TransactionAggregatesService,
        private readonly context: AppContext
    ) {
        super();
    }

    public description(locale: AppLocale): string {
        return locale === 'pt-BR'
            ? 'Total gasto por mês em uma categoria (ou em todas) num período de até 12 meses. Nunca devolve lançamentos individuais.'
            : 'Amount spent per month in one category (or all) over a period of up to 12 months. Never returns individual transactions.';
    }

    public async run(input: unknown): Promise<AskVeraToolOutput> {
        const parsed: ByCategoryInput = byCategoryInputSchema.parse(input);
        const keying: CategoryKeying = keyCategories(await this.categories.listForCompany(), this.context.get().locale);
        const wanted: readonly KeyedCategory[] = keying.entries.filter(
            (entry: KeyedCategory): boolean => parsed.categoryKey === undefined || entry.assigned.chave === parsed.categoryKey
        );
        if (wanted.length === 0) {
            return { payload: { error: 'unknown category key; use list_categories' } };
        }
        const rows: readonly MonthlyCategoryNet[] = await this.aggregates.monthlyNetByCategory({
            fromMonth: parsed.fromMonth,
            toMonth: parsed.toMonth
        });
        const facts: ContextFacts = new ContextFacts(this.context.get().locale, AI_SPENDING_CURRENCY);
        return { payload: this.payloadOf(parsed, wanted, rows, facts), numbers: facts.numbers(), keys: keying.keys };
    }

    private payloadOf(
        input: ByCategoryInput,
        wanted: readonly KeyedCategory[],
        rows: readonly MonthlyCategoryNet[],
        facts: ContextFacts
    ): JsonObject {
        const months: readonly string[] = this.monthsOf(input);
        const byCategory: ReadonlyMap<string | null, ReadonlyMap<string, number>> = spentByCategory(rows);
        const entries: JsonObject[] = wanted
            .filter((entry: KeyedCategory): boolean => input.categoryKey !== undefined || byCategory.has(entry.categoryId))
            .map((entry: KeyedCategory): JsonObject =>
                entryOf(entry, months, byCategory.get(entry.categoryId) ?? new Map<string, number>(), facts)
            );
        return { periodo: { de: input.fromMonth, ate: input.toMonth }, categorias: entries };
    }

    private monthsOf(input: ByCategoryInput): readonly string[] {
        const first: number = monthIndexOf(input.fromMonth);
        return Array.from({ length: monthIndexOf(input.toMonth) - first + 1 }, (_unused: unknown, offset: number): string =>
            monthOfIndex(first + offset)
        );
    }
}
