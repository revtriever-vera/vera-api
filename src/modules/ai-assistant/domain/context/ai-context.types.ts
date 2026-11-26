export type AiMarkerKind = 'cat' | 'cls' | 'ativo';

export interface LabelSource {
    readonly kind: AiMarkerKind;
    readonly name: string;
}

export interface AiCategoryEntry {
    readonly chave: string;
    readonly rotulo_padrao?: string;
    readonly tipo: 'fixo' | 'flexivel';
    readonly total: string;
    readonly media_3m: string | null;
    readonly variacao_pct: string | null;
    readonly nova: boolean;
}

export interface AiMonthContext {
    readonly mes: string;
    readonly parcial: boolean;
    readonly renda: string;
    readonly gastos: string;
    readonly guardado: string;
    readonly taxa_poupanca: string | null;
    readonly meta_economia_pct: string;
    readonly falta_para_meta: string;
    readonly fixos: { readonly total: string; readonly pct_renda: string | null };
    readonly flexiveis: { readonly total: string };
    readonly sem_categoria: { readonly total: string; readonly transacoes: number };
    readonly gastos_por_categoria: readonly AiCategoryEntry[];
}

export type AiCutsStatus = 'meta_batida' | 'possivel' | 'so_cortar_nao_resolve';

export interface AiCutEntry {
    readonly chave: string;
    readonly rotulo_padrao?: string;
    readonly atual: string;
    readonly media_3m: string | null;
    readonly cortar: string;
    readonly limite_sugerido: string;
}

export interface AiCutsContext {
    readonly meta_economia_pct: string;
    readonly falta_por_mes: string;
    readonly status: AiCutsStatus;
    readonly categorias_flexiveis: readonly AiCutEntry[];
}

export type AiClassStatus = 'abaixo' | 'dentro' | 'acima';

export interface AiClassEntry {
    readonly chave: string;
    readonly rotulo_padrao?: string;
    readonly atual: string;
    readonly meta: string;
    readonly situacao: AiClassStatus;
}

export interface AiPlannedContribution {
    readonly total: string;
    readonly por_classe: readonly { readonly chave: string; readonly valor: string }[];
}

export interface AiPortfolioContext {
    readonly moeda_base: string;
    readonly total: string;
    readonly exposicao_dolar_pct: string;
    readonly tolerancia_pp: string;
    readonly carteira_pct: readonly AiClassEntry[];
    readonly aporte_planejado?: AiPlannedContribution;
}

export interface AiIssuerEntry {
    readonly emissor: string;
    readonly valor: string;
    readonly pct: string;
}

export interface AiSectorEntry {
    readonly setor: string;
    readonly valor: string;
    readonly pct: string;
}

export interface AiConcentrationContext {
    readonly moeda_base: string;
    readonly total: string;
    readonly total_acoes: string;
    readonly por_emissor: readonly AiIssuerEntry[];
    readonly outros_emissores?: { readonly pct: string; readonly grupos: number };
    readonly por_setor: readonly AiSectorEntry[];
}

export interface AiMaturityEntry {
    readonly mes: string;
    readonly valor: string;
}

export interface AiMaturityKindEntry {
    readonly tipo: string;
    readonly total: string;
    readonly vencimentos: readonly AiMaturityEntry[];
}

export interface AiMaturitiesContext {
    readonly moeda_base: string;
    readonly ate: string;
    readonly total: string;
    readonly estimado: boolean;
    readonly por_tipo: readonly AiMaturityKindEntry[];
}

export interface AiBenchmarkPeriod {
    readonly periodo: string;
    readonly valor: string;
}

export interface AiBenchmarkSeries {
    readonly fonte: string;
    readonly ate: string | null;
    readonly atrasado: boolean;
    readonly acumulado: readonly AiBenchmarkPeriod[];
    readonly sem_historico: readonly string[];
}

export type AiIbovespaStatus = 'ok' | 'nao_configurado' | 'sem_dados';

export interface AiBenchmarksContext {
    readonly referencia: string;
    readonly cdi: AiBenchmarkSeries;
    readonly ipca: AiBenchmarkSeries;
    readonly selic_meta: {
        readonly fonte: string;
        readonly ate: string | null;
        readonly atrasado: boolean;
        readonly valor: string | null;
    };
    readonly ibovespa: AiBenchmarkSeries & { readonly status: AiIbovespaStatus };
}

export interface AiAssetQuote {
    readonly valor: string;
    readonly data: string;
    readonly atrasada: boolean;
}

export interface AiAssetEntry {
    readonly nome: string;
    readonly ticker: string;
    readonly tipo: string;
    readonly classe: string | null;
    readonly mercado: string;
    readonly cotacao: AiAssetQuote | null;
    readonly fund_id?: string;
}

export interface AiAssetLookupContext {
    readonly ativos: readonly AiAssetEntry[];
}

export type AiFundStatus = 'ok' | 'fundo_nao_encontrado' | 'sem_dados';

export interface AiFundWindowEntry {
    readonly periodo: string;
    readonly fundo: string;
    readonly cdi: string | null;
    readonly diferenca: string | null;
    readonly situacao: 'acima_do_cdi' | 'abaixo_do_cdi' | 'igual_ao_cdi' | null;
}

export interface AiFundPerformanceContext {
    readonly status: AiFundStatus;
    readonly fundo: string;
    readonly fonte: string;
    readonly ate: string | null;
    readonly atrasado: boolean;
    readonly cdi_fonte: string;
    readonly cdi_ate: string | null;
    readonly historico_completo: boolean;
    readonly janelas: readonly AiFundWindowEntry[];
    readonly sem_historico: readonly string[];
}

export type AiFixedIncomeStatus = 'ok' | 'escolha_um_titulo' | 'titulo_nao_encontrado' | 'sem_titulos' | 'sem_indice';

export interface AiFixedIncomeEntry {
    readonly chave: string;
    readonly tipo: string;
    readonly indexador: string;
    readonly taxa_contratada: string;
    readonly aplicado_em: string;
    readonly taxa_nominal_estimada: string | null;
    readonly taxa_real_estimada: string | null;
    readonly ganha_da_inflacao: boolean | null;
    readonly contra_cdi_12m: string | null;
    readonly situacao_contra_cdi: 'acima' | 'abaixo' | 'igual' | null;
    readonly estimado: boolean;
}

export interface AiFixedIncomeBenchmarkContext {
    readonly status: AiFixedIncomeStatus;
    readonly cdi_12m: { readonly valor: string | null; readonly fonte: string; readonly ate: string | null };
    readonly ipca_12m: { readonly valor: string | null; readonly fonte: string; readonly ate: string | null };
    readonly titulos: readonly AiFixedIncomeEntry[];
}

export interface ReviewClassLabel {
    readonly classId: string;
    readonly systemKey: string | null;
    readonly displayName: string;
}

export interface ReviewSource {
    readonly month: string;
    readonly baseCurrency: string;
    readonly returnPct?: number;
    readonly byClass: readonly { readonly classId: string | null; readonly endMinor: number; readonly returnPct?: number }[];
    readonly benchmarks: Readonly<Record<'cdi' | 'ipca' | 'ibovespa', { readonly state: string; readonly returnPct: number | null }>>;
    readonly topGainers: readonly { readonly symbol: string; readonly variationPct: number }[];
    readonly topLosers: readonly { readonly symbol: string; readonly variationPct: number }[];
    readonly income: { readonly amountMinor: number };
    readonly concentration: {
        readonly topIssuers: readonly { readonly name: string | null; readonly shareBps: number }[];
        readonly sectors: readonly { readonly shareBps: number }[];
        readonly fgcExposure: { readonly overLimitMinor: number };
    };
    readonly coverage: { readonly reason: AiReviewCoverage | null };
}

export type AiReviewCoverage = 'no_operations' | 'no_previous_snapshot' | 'classes_not_closing' | 'no_base';

export interface AiReviewClassEntry {
    readonly chave: string;
    readonly rotulo_padrao?: string;
    readonly rentabilidade_pct: string | null;
}

export interface AiReviewMoveEntry {
    readonly chave: string;
    readonly variacao_pct: string;
}

export interface AiReviewIndices {
    readonly cdi_pct: string | null;
    readonly ipca_pct: string | null;
    readonly ibovespa_pct: string | null;
}

export interface AiReviewConcentration {
    readonly maior_emissor_pct: string | null;
    readonly maior_setor_pct: string | null;
    readonly acima_do_fgc: boolean;
}

export interface AiMonthlyReviewContext {
    readonly mes: string;
    readonly rentabilidade_pct: string | null;
    readonly sem_rentabilidade_motivo: AiReviewCoverage | null;
    readonly por_classe: readonly AiReviewClassEntry[];
    readonly indices: AiReviewIndices;
    readonly maiores_altas: readonly AiReviewMoveEntry[];
    readonly maiores_quedas: readonly AiReviewMoveEntry[];
    readonly proventos_pct_carteira: string | null;
    readonly concentracao: AiReviewConcentration;
}

export type AiContext =
    | AiMonthContext
    | AiCutsContext
    | AiPortfolioContext
    | AiMonthlyReviewContext
    | AiConcentrationContext
    | AiMaturitiesContext
    | AiBenchmarksContext
    | AiAssetLookupContext
    | AiFundPerformanceContext
    | AiFixedIncomeBenchmarkContext;

export interface BuiltContext<T extends AiContext> {
    readonly payload: T;
    readonly numbers: readonly number[];
    readonly keys: ReadonlyMap<string, LabelSource>;
}
