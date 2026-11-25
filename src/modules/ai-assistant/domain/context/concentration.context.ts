import type { ConcentrationResponse } from '../../../concentration/services/concentration-reader.service';
import { AppLocale } from '../../../../shared/i18n/locale';
import { AiConcentrationContext, AiIssuerEntry, AiSectorEntry, BuiltContext } from './ai-context.types';
import { ContextFacts } from './context-facts';
import { bucketLabel } from './default-labels';

type IssuerRowOf = ConcentrationResponse['byIssuer'][number];
type SectorRowOf = ConcentrationResponse['bySector'][number];

function issuerEntry(row: IssuerRowOf, facts: ContextFacts, locale: AppLocale): AiIssuerEntry {
    const named: string | null = row.kind === 'group' ? row.name : null;
    return { emissor: named ?? bucketLabel(row.key, locale), valor: facts.money(row.valueMinor), pct: facts.percent(row.shareBps) };
}

function sectorEntry(row: SectorRowOf, facts: ContextFacts): AiSectorEntry {
    return { setor: row.key, valor: facts.money(row.valueMinor), pct: facts.percent(row.shareBps) };
}

export function buildConcentrationContext(response: ConcentrationResponse, locale: AppLocale): BuiltContext<AiConcentrationContext> {
    const facts: ContextFacts = new ContextFacts(locale, response.baseCurrency);
    const base: Omit<AiConcentrationContext, 'outros_emissores'> = {
        moeda_base: response.baseCurrency,
        total: facts.money(response.totalMinor),
        total_acoes: facts.money(response.equityTotalMinor),
        por_emissor: response.byIssuer.map((row: IssuerRowOf): AiIssuerEntry => issuerEntry(row, facts, locale)),
        por_setor: response.bySector.map((row: SectorRowOf): AiSectorEntry => sectorEntry(row, facts))
    };
    const others: ConcentrationResponse['byIssuerOthers'] = response.byIssuerOthers;
    const payload: AiConcentrationContext =
        others === null ? base : { ...base, outros_emissores: { pct: facts.percent(others.shareBps), grupos: facts.count(others.groups) } };
    return { payload, numbers: facts.numbers(), keys: new Map() };
}
