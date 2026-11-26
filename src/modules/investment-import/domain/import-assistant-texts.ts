import { AppLocale } from '../../../shared/i18n/locale';

export interface ImportCounts {
    readonly operations: number;
    readonly assets: number;
    readonly titles: number;
}

interface Words {
    readonly operation: readonly [string, string];
    readonly asset: readonly [string, string];
    readonly title: readonly [string, string];
    readonly in: string;
    readonly and: string;
    readonly import: string;
    readonly done: string;
}

const WORDS: Readonly<Record<AppLocale, Words>> = {
    'pt-BR': {
        operation: ['operação', 'operações'],
        asset: ['ativo', 'ativos'],
        title: ['título de renda fixa', 'títulos de renda fixa'],
        in: 'em',
        and: 'e',
        import: 'Importar',
        done: 'Importação confirmada:'
    },
    en: {
        operation: ['operation', 'operations'],
        asset: ['asset', 'assets'],
        title: ['fixed income title', 'fixed income titles'],
        in: 'in',
        and: 'and',
        import: 'Import',
        done: 'Import confirmed:'
    }
};

function joiner(words: Words): string {
    return ` ${words.and} `;
}

function counted(count: number, forms: readonly [string, string]): string {
    return `${String(count)} ${count === 1 ? forms[0] : forms[1]}`;
}

export function importProposalSummary(counts: ImportCounts, locale: AppLocale): string {
    const words: Words = WORDS[locale];
    const parts: string[] = [];
    if (counts.operations > 0) {
        const operations: string = counted(counts.operations, words.operation);
        parts.push([operations, words.in, counted(counts.assets, words.asset)].join(' '));
    }
    if (counts.titles > 0) {
        parts.push(counted(counts.titles, words.title));
    }
    return `${words.import} ${parts.join(joiner(words))}.`;
}

export function importDoneText(applied: number, titles: number, locale: AppLocale): string {
    const words: Words = WORDS[locale];
    const parts: string[] = [counted(applied, words.operation)];
    if (titles > 0) {
        parts.push(counted(titles, words.title));
    }
    return `${words.done} ${parts.join(joiner(words))}.`;
}
