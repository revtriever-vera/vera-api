import { AppLocale } from '../../../shared/i18n/locale';

export interface WeeklyChangesCopy {
    readonly subject: string;
    readonly title: string;
    readonly documentLabel: string;
    readonly ctaLabel: string;
    readonly footnote: string;
}

const COPY: Readonly<Record<AppLocale, WeeklyChangesCopy>> = {
    'pt-BR': {
        subject: 'O que saiu sobre a sua carteira nesta semana',
        title: 'O que saiu sobre a sua carteira nesta semana',
        documentLabel: 'Documento',
        ctaLabel: 'Ver a Carteira',
        footnote: 'Isto não é uma recomendação de compra ou venda.'
    },
    en: {
        subject: 'What came out about your portfolio this week',
        title: 'What came out about your portfolio this week',
        documentLabel: 'Document',
        ctaLabel: 'See the Portfolio',
        footnote: 'This is not a recommendation to buy or sell.'
    }
};

export function weeklyChangesCopy(locale: AppLocale): WeeklyChangesCopy {
    return COPY[locale];
}
