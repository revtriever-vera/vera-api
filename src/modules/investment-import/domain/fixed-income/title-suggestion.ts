import type { Indexer } from '../../../fixed-income/services/index-series-math';
import { FIXED_INCOME_REASONS, FIXED_INCOME_STATUSES, FixedIncomeReason, StoredFixedIncome } from './fixed-income-import.types';

type Suggestible = Omit<StoredFixedIncome, 'suggestion'>;

const BPS_PER_UNIT: number = 10000;
const CDI_DIGITS: number = 1;
const SPREAD_DIGITS: number = 2;
const NO_ISSUER: string = 'emissor não informado';

const REASON_TEXTS: Readonly<Partial<Record<FixedIncomeReason, string>>> = {
    [FIXED_INCOME_REASONS.gracePeriod]: 'o título está em carência e a curva pode não refletir a taxa contratada',
    [FIXED_INCOME_REASONS.applicationDateDiffers]: 'a data de aplicação é diferente da data de emissão',
    [FIXED_INCOME_REASONS.estimatedSeries]: 'parte do período usa índice estimado',
    [FIXED_INCOME_REASONS.paymentEvent]: 'o título teve pagamento de juros ou amortização e não dá para separar o efeito na curva',
    [FIXED_INCOME_REASONS.missingData]: 'faltam dados na planilha para calcular a taxa',
    [FIXED_INCOME_REASONS.missingSeries]: 'ainda não temos o índice do período',
    [FIXED_INCOME_REASONS.implausible]: 'a taxa calculada ficou fora do esperado',
    [FIXED_INCOME_REASONS.tooRecent]: 'o título é recente demais para calcular a taxa',
    [FIXED_INCOME_REASONS.unsupportedKind]: 'não reconhecemos o tipo do título',
    [FIXED_INCOME_REASONS.duplicate]: 'já existe um título igual cadastrado'
};

function percentText(rateBps: number, digits: number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: digits }).format(rateBps / BPS_PER_UNIT);
}

function rateText(indexer: Indexer | null, rateBps: number | null): string | null {
    if (indexer === null || rateBps === null) {
        return null;
    }
    if (indexer === 'cdi_percent') {
        return `${percentText(rateBps, CDI_DIGITS)} do CDI`;
    }
    return indexer === 'ipca_plus' ? `IPCA + ${percentText(rateBps, SPREAD_DIGITS)}` : `${percentText(rateBps, SPREAD_DIGITS)} a.a.`;
}

function maturityText(maturityDate: string | null): string | null {
    return maturityDate === null ? null : `vence em ${maturityDate.slice(5, 7)}/${maturityDate.slice(0, 4)}`;
}

function describedAs(fields: Suggestible): string {
    const kind: string = fields.kind === null ? 'Título' : fields.kind.toUpperCase();
    const parts: (string | null)[] = [
        `${kind} ${fields.issuerName ?? NO_ISSUER}`,
        rateText(fields.indexer, fields.rateBps),
        maturityText(fields.maturityDate)
    ];
    return parts.filter((part: string | null): part is string => part !== null).join(', ');
}

function reasonSentence(reason: FixedIncomeReason | null): string {
    const text: string | undefined = reason === null ? undefined : REASON_TEXTS[reason];
    return text === undefined ? '' : ` Atenção: ${text}.`;
}

export function suggestionOf(fields: Suggestible): string {
    if (fields.status === FIXED_INCOME_STATUSES.inferred) {
        return `Achamos: ${describedAs(fields)}. Confirmar?`;
    }
    if (fields.status === FIXED_INCOME_STATUSES.check) {
        return `Achamos: ${describedAs(fields)}. Confirmar?${reasonSentence(fields.reason)}`;
    }
    if (fields.status === FIXED_INCOME_STATUSES.duplicate) {
        return `Já existe um título igual: ${describedAs(fields)}.`;
    }
    return `Complete o título: ${describedAs(fields)}.${reasonSentence(fields.reason)}`;
}
