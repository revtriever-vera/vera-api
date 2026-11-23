import type { ContributionSuggestion } from '../../../contribution/services/contribution-planner.service';
import type { ClassSummary, PortfolioSnapshot } from '../../../portfolio/services/portfolio-snapshot.service';
import { AppLocale } from '../../../../shared/i18n/locale';
import { AiClassEntry, AiClassStatus, AiPlannedContribution, AiPortfolioContext, BuiltContext } from './ai-context.types';
import { ContextFacts } from './context-facts';
import { ContextKeys } from './context-keys';
import { defaultClassLabel } from './default-labels';

const SITUATION_BY_STATUS: Readonly<Record<string, AiClassStatus>> = {
    below: 'abaixo',
    within: 'dentro',
    above: 'acima'
};

interface Keyed {
    readonly entry: AiClassEntry;
    readonly classId: string;
}

function classEntry(item: ClassSummary, keys: ContextKeys, facts: ContextFacts, locale: AppLocale): Keyed {
    const defaultLabel: string | null = defaultClassLabel(item.systemKey, locale);
    return {
        classId: item.classId,
        entry: {
            ...keys.assign({ kind: 'cls', systemKey: item.systemKey, realName: item.displayName, defaultLabel }),
            atual: facts.percent(item.shareBps),
            meta: facts.percent(item.targetBps),
            situacao: SITUATION_BY_STATUS[item.status] ?? 'dentro'
        }
    };
}

function plannedOf(contribution: ContributionSuggestion, keyed: readonly Keyed[], facts: ContextFacts): AiPlannedContribution {
    const keyByClass: ReadonlyMap<string, string> = new Map<string, string>(
        keyed.map((item: Keyed): [string, string] => [item.classId, item.entry.chave])
    );
    return {
        total: facts.money(contribution.amountMinor),
        por_classe: contribution.classes
            .filter((item): boolean => keyByClass.has(item.classId))
            .map((item): { chave: string; valor: string } => ({
                chave: keyByClass.get(item.classId) ?? '',
                valor: facts.money(item.amountMinor)
            }))
    };
}

export function buildPortfolioContext(
    snapshot: PortfolioSnapshot,
    contribution: ContributionSuggestion | null,
    locale: AppLocale
): BuiltContext<AiPortfolioContext> {
    const facts: ContextFacts = new ContextFacts(locale, snapshot.baseCurrency);
    const keys: ContextKeys = new ContextKeys();
    const keyed: Keyed[] = snapshot.classes.map((item: ClassSummary): Keyed => classEntry(item, keys, facts, locale));
    const base: Omit<AiPortfolioContext, 'aporte_planejado'> = {
        moeda_base: snapshot.baseCurrency,
        total: facts.money(snapshot.totalMinor),
        exposicao_dolar_pct: facts.percent(snapshot.dollarExposure.shareBps),
        tolerancia_pp: facts.points(snapshot.toleranceBps),
        carteira_pct: keyed.map((item: Keyed): AiClassEntry => item.entry)
    };
    const payload: AiPortfolioContext = contribution === null ? base : { ...base, aporte_planejado: plannedOf(contribution, keyed, facts) };
    return { payload, numbers: facts.numbers(), keys: keys.all() };
}
