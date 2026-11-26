import { AppLocale } from '../../../shared/i18n/locale';

export interface MonthlyReviewCopy {
    readonly subject: (month: string) => string;
    readonly title: (month: string) => string;
    readonly returnLabel: string;
    readonly noReturn: string;
    readonly cdiLabel: string;
    readonly ipcaLabel: string;
    readonly ibovespaLabel: string;
    readonly incomeLabel: string;
    readonly ctaLabel: string;
    readonly footnote: string;
}

function monthName(month: string, locale: AppLocale): string {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`));
}

const COPY: Readonly<Record<AppLocale, MonthlyReviewCopy>> = {
    'pt-BR': {
        subject: (month: string): string => `O Raio-X de ${monthName(month, 'pt-BR')} da sua carteira`,
        title: (month: string): string => `Raio-X do mês: ${monthName(month, 'pt-BR')}`,
        returnLabel: 'Rentabilidade da carteira',
        noReturn: 'A rentabilidade deste mês não pôde ser calculada com as operações importadas.',
        cdiLabel: 'CDI',
        ipcaLabel: 'IPCA',
        ibovespaLabel: 'Ibovespa',
        incomeLabel: 'Proventos do mês',
        ctaLabel: 'Ver o Raio-X',
        footnote: 'Isto não é uma recomendação de compra ou venda.'
    },
    en: {
        subject: (month: string): string => `The ${monthName(month, 'en')} X-ray of your portfolio`,
        title: (month: string): string => `Monthly X-ray: ${monthName(month, 'en')}`,
        returnLabel: 'Portfolio return',
        noReturn: "This month's return could not be calculated from the imported operations.",
        cdiLabel: 'CDI',
        ipcaLabel: 'IPCA',
        ibovespaLabel: 'Ibovespa',
        incomeLabel: 'Income in the month',
        ctaLabel: 'See the X-ray',
        footnote: 'This is not a recommendation to buy or sell.'
    }
};

export function monthlyReviewCopy(locale: AppLocale): MonthlyReviewCopy {
    return COPY[locale];
}
