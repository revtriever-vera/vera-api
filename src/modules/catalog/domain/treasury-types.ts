export interface TreasuryType {
    readonly slug: string;
    readonly label: string;
}

const EXACT: Readonly<Record<string, TreasuryType>> = {
    'tesouro selic': { slug: 'selic', label: 'Tesouro Selic' },
    'tesouro prefixado': { slug: 'prefixado', label: 'Tesouro Prefixado' },
    'tesouro prefixado com juros semestrais': { slug: 'prefixado-juros-semestrais', label: 'Tesouro Prefixado com Juros Semestrais' },
    'tesouro ipca+': { slug: 'ipca', label: 'Tesouro IPCA+' },
    'tesouro ipca+ com juros semestrais': { slug: 'ipca-juros-semestrais', label: 'Tesouro IPCA+ com Juros Semestrais' }
};

const BY_PREFIX: ReadonlyArray<readonly [string, TreasuryType]> = [
    ['tesouro renda+', { slug: 'renda-mais', label: 'Tesouro Renda+' }],
    ['tesouro educa+', { slug: 'educa-mais', label: 'Tesouro Educa+' }]
];

function normalized(name: string): string {
    return name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function treasuryTypeOf(name: string): TreasuryType | null {
    const key: string = normalized(name);
    const exact: TreasuryType | undefined = EXACT[key];
    if (exact) {
        return exact;
    }
    return BY_PREFIX.find(([prefix]: readonly [string, TreasuryType]) => key.startsWith(prefix))?.[1] ?? null;
}
