import type { CutsResult } from '../../../spending-cuts/services/spending-cuts.service';
import { AppLocale } from '../../../../shared/i18n/locale';
import { AiCutEntry, AiCutsContext, AiCutsStatus, BuiltContext } from './ai-context.types';
import { ContextFacts } from './context-facts';
import { ContextKeys } from './context-keys';
import { defaultCategoryLabel } from './default-labels';
import { AI_SPENDING_CURRENCY } from './month.context';

type CutSuggestionOf = CutsResult['suggestions'][number];

const STATUS_BY_CUT: Readonly<Record<string, AiCutsStatus>> = {
    goal_met: 'meta_batida',
    cut_suggested: 'possivel',
    exceeds_flexible: 'so_cortar_nao_resolve'
};

export function cutsStatusOf(status: string): AiCutsStatus | null {
    return STATUS_BY_CUT[status] ?? null;
}

function cutEntry(item: CutSuggestionOf, keys: ContextKeys, facts: ContextFacts, locale: AppLocale): AiCutEntry {
    const defaultLabel: string | null = defaultCategoryLabel(item.systemKey, locale);
    return {
        ...keys.assign({
            kind: 'cat',
            systemKey: item.systemKey,
            realName: item.name ?? defaultLabel ?? item.systemKey ?? '',
            defaultLabel
        }),
        atual: facts.money(item.spentMinor),
        media_3m: facts.moneyOrNull(item.averageMinor),
        cortar: facts.money(item.cutMinor),
        limite_sugerido: facts.money(item.limitMinor)
    };
}

export function buildCutsContext(result: CutsResult, locale: AppLocale): BuiltContext<AiCutsContext> | null {
    const status: AiCutsStatus | null = cutsStatusOf(result.status);
    if (status === null) {
        return null;
    }
    const facts: ContextFacts = new ContextFacts(locale, AI_SPENDING_CURRENCY);
    const keys: ContextKeys = new ContextKeys();
    const payload: AiCutsContext = {
        meta_economia_pct: facts.percent(result.goal.bps),
        falta_por_mes: facts.money(result.gapMinor),
        status,
        categorias_flexiveis: result.suggestions.map((item: CutSuggestionOf): AiCutEntry => cutEntry(item, keys, facts, locale))
    };
    return { payload, numbers: facts.numbers(), keys: keys.all() };
}
