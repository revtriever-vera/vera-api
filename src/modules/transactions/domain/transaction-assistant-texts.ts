import { AppLocale } from '../../../shared/i18n/locale';

export function proposalSummary(categoryLabel: string, always: boolean, locale: AppLocale): string {
    if (locale === 'pt-BR') {
        return always
            ? `Categorizar uma transação como ${categoryLabel} e criar a regra para as próximas parecidas. Escolha a transação abaixo.`
            : `Categorizar uma transação como ${categoryLabel}. Escolha a transação abaixo.`;
    }
    return always
        ? `Categorize a transaction as ${categoryLabel} and create the rule for the next similar ones. Pick the transaction below.`
        : `Categorize a transaction as ${categoryLabel}. Pick the transaction below.`;
}

export function categorizedText(categoryLabel: string, rulesApplied: number, always: boolean, locale: AppLocale): string {
    if (locale === 'pt-BR') {
        const rule: string = always
            ? ` Regra criada: as próximas parecidas também vão para ${categoryLabel} (${String(rulesApplied)} ajustadas).`
            : '';
        return `Transação categorizada como ${categoryLabel}.${rule}`;
    }
    const rule: string = always
        ? ` Rule created: the next similar ones also go to ${categoryLabel} (${String(rulesApplied)} adjusted).`
        : '';
    return `Transaction categorized as ${categoryLabel}.${rule}`;
}
