import type { MonthlySummary } from '../../../spending-summary/services/spending-summary.service';
import { AppLocale } from '../../../../shared/i18n/locale';
import { AiCategoryEntry, AiMonthContext, BuiltContext } from './ai-context.types';
import { ContextFacts } from './context-facts';
import { AssignedKey, ContextKeys } from './context-keys';
import { defaultCategoryLabel } from './default-labels';

type SummaryRow = MonthlySummary['categories'][number];

export const AI_SPENDING_CURRENCY: string = 'BRL';

export function categoryKeyOf(keys: ContextKeys, row: SummaryRow, locale: AppLocale): AssignedKey {
    const defaultLabel: string | null = defaultCategoryLabel(row.systemKey, locale);
    return keys.assign({
        kind: 'cat',
        systemKey: row.systemKey,
        realName: row.name ?? defaultLabel ?? row.systemKey ?? '',
        defaultLabel
    });
}

function categoryEntry(row: SummaryRow, keys: ContextKeys, facts: ContextFacts, locale: AppLocale): AiCategoryEntry {
    return {
        ...categoryKeyOf(keys, row, locale),
        tipo: row.flexibility === 'fixed' ? 'fixo' : 'flexivel',
        total: facts.money(row.spentMinor),
        media_3m: facts.moneyOrNull(row.averageMinor),
        variacao_pct: facts.signedPercentOrNull(row.deltaBps),
        nova: row.isNew
    };
}

export function buildMonthContext(summary: MonthlySummary, locale: AppLocale): BuiltContext<AiMonthContext> {
    const facts: ContextFacts = new ContextFacts(locale, AI_SPENDING_CURRENCY);
    const keys: ContextKeys = new ContextKeys();
    const payload: AiMonthContext = {
        mes: summary.month,
        parcial: summary.isPartial,
        renda: facts.money(summary.income.minor),
        gastos: facts.money(summary.expensesMinor),
        guardado: facts.money(summary.savedMinor),
        taxa_poupanca: facts.percentOrNull(summary.savingsRateBps),
        meta_economia_pct: facts.percent(summary.goal.bps),
        falta_para_meta: facts.money(summary.gapMinor),
        fixos: { total: facts.money(summary.fixedMinor), pct_renda: facts.percentOrNull(summary.fixedShareBps) },
        flexiveis: { total: facts.money(summary.flexibleMinor) },
        sem_categoria: { total: facts.money(summary.uncategorizedMinor), transacoes: facts.count(summary.uncategorizedCount) },
        gastos_por_categoria: summary.categories.map((row: SummaryRow): AiCategoryEntry => categoryEntry(row, keys, facts, locale))
    };
    return { payload, numbers: facts.numbers(), keys: keys.all() };
}
