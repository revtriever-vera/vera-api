/**
 * Public FGC rules (Estatuto e Regulamento do FGC, fgc.org.br, as regulated by CMN Resolution 4.222/2013):
 * the guarantee is R$ 250,000 per CPF per prudential conglomerate, and the guarantees paid to the same
 * person are limited to R$ 1,000,000 every 4 years. The limit changes by CMN resolution: changing it is a PR,
 * and FGC_RULE_EFFECTIVE_FROM says since when the figures below hold.
 */
export const FGC_RULE_EFFECTIVE_FROM: string = '2013-05-23';
export const FGC_LIMIT_PER_GROUP_MINOR: number = 25_000_000;
export const FGC_CAP_MINOR: number = 100_000_000;
export const FGC_CURRENCY: string = 'BRL';
export const FGC_COVERED_TITLE_KINDS: readonly string[] = ['cdb', 'lci', 'lca', 'lc'];
export const FGC_TITLE_KINDS: readonly ['cdb', 'lci', 'lca', 'lc', 'debenture', 'cri', 'cra'] = [
    'cdb',
    'lci',
    'lca',
    'lc',
    'debenture',
    'cri',
    'cra'
];
export const FGC_SIMULATIONS_PER_MINUTE: number = 60;
export const FGC_SIMULATION_WINDOW_SECONDS: number = 60;
export const FGC_MAX_SIMULATED_MINOR: number = 1_000_000_000_000;
