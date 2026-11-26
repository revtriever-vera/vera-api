import { z } from 'zod';

const category = z.object({
    chave: z.string(),
    rotulo_padrao: z.string().optional(),
    tipo: z.enum(['fixo', 'flexivel']),
    total: z.string(),
    media_3m: z.string().nullable(),
    variacao_pct: z.string().nullable(),
    nova: z.boolean()
});

const monthContext = z.object({
    mes: z.string(),
    parcial: z.boolean(),
    renda: z.string(),
    gastos: z.string(),
    guardado: z.string(),
    taxa_poupanca: z.string().nullable(),
    meta_economia_pct: z.string(),
    falta_para_meta: z.string(),
    fixos: z.object({ total: z.string(), pct_renda: z.string().nullable() }),
    flexiveis: z.object({ total: z.string() }),
    sem_categoria: z.object({ total: z.string(), transacoes: z.number() }),
    gastos_por_categoria: z.array(category)
});

const cutEntry = z.object({
    chave: z.string(),
    rotulo_padrao: z.string().optional(),
    atual: z.string(),
    media_3m: z.string().nullable(),
    cortar: z.string(),
    limite_sugerido: z.string()
});

const cutsContext = z.object({
    meta_economia_pct: z.string(),
    falta_por_mes: z.string(),
    status: z.enum(['meta_batida', 'possivel', 'so_cortar_nao_resolve']),
    categorias_flexiveis: z.array(cutEntry)
});

const portfolioContext = z.object({
    moeda_base: z.string(),
    total: z.string(),
    exposicao_dolar_pct: z.string(),
    tolerancia_pp: z.string(),
    carteira_pct: z.array(
        z.object({
            chave: z.string(),
            rotulo_padrao: z.string().optional(),
            atual: z.string(),
            meta: z.string(),
            situacao: z.enum(['abaixo', 'dentro', 'acima'])
        })
    ),
    aporte_planejado: z.object({ total: z.string(), por_classe: z.array(z.object({ chave: z.string(), valor: z.string() })) }).optional()
});

const reviewClass = z.object({
    chave: z.string(),
    rotulo_padrao: z.string().optional(),
    rentabilidade_pct: z.string().nullable()
});

const reviewMove = z.object({ chave: z.string(), variacao_pct: z.string() });

const monthlyReviewContext = z.object({
    mes: z.string(),
    rentabilidade_pct: z.string().nullable(),
    sem_rentabilidade_motivo: z.enum(['no_operations', 'no_previous_snapshot', 'classes_not_closing', 'no_base']).nullable(),
    por_classe: z.array(reviewClass),
    indices: z.object({ cdi_pct: z.string().nullable(), ipca_pct: z.string().nullable(), ibovespa_pct: z.string().nullable() }),
    maiores_altas: z.array(reviewMove),
    maiores_quedas: z.array(reviewMove),
    proventos_pct_carteira: z.string().nullable(),
    concentracao: z.object({
        maior_emissor_pct: z.string().nullable(),
        maior_setor_pct: z.string().nullable(),
        acima_do_fgc: z.boolean()
    })
});

const expectations = z.object({
    mustCite: z.array(z.string()),
    mustMention: z.array(z.string()),
    mustNotMention: z.array(z.string()),
    sentences: z.object({ min: z.number().int().min(1), max: z.number().int().min(1) })
});

const common = {
    id: z.string().min(1),
    locale: z.enum(['pt-BR', 'en']),
    labels: z.record(z.string(), z.string()),
    expect: expectations,
    reference: z.array(z.string().min(1)).min(1),
    fixedFigures: z.object({ goalBps: z.number(), surplusMinor: z.number(), currency: z.string() }).optional()
};

const askFields = {
    ...common,
    pending: z.boolean().default(false),
    question: z.string().min(1),
    history: z.array(z.object({ role: z.enum(['person', 'vera']), text: z.string() })),
    tools: z.object({ required: z.array(z.string()), allowed: z.array(z.string()) }),
    mockTools: z.array(z.object({ name: z.string(), input: z.record(z.string(), z.unknown()) })),
    plan: z.enum(['free', 'premium']).default('premium'),
    role: z.enum(['viewer', 'editor', 'owner']).default('owner'),
    screen: z.string().optional()
};

const documentFields = {
    ...common,
    task: z.literal('market_document_summary'),
    document: z.object({
        issuer: z.string(),
        tickers: z.array(z.string()),
        category: z.string(),
        publishedAt: z.string(),
        text: z.string().min(1)
    }),
    expectDiscard: z.boolean(),
    referenceOutput: z.object({
        kind: z.enum(['result', 'income', 'relevant_fact', 'meeting', 'management', 'routine']),
        relevance: z.number().int().min(0).max(3),
        discard: z.boolean(),
        numbers: z.array(z.string())
    })
};

const askCase = z.object({ ...askFields, task: z.literal('ask_vera_step') });
const askAppCase = z.object({ ...askFields, task: z.literal('ask_vera_app_step') });

export const evalCaseSchema = z.discriminatedUnion('task', [
    askCase,
    askAppCase,
    z.object({ ...common, task: z.literal('summary_month'), context: monthContext }),
    z.object({ ...common, task: z.literal('summary_cuts'), context: cutsContext }),
    z.object({ ...common, task: z.literal('summary_portfolio'), context: portfolioContext }),
    z.object({ ...common, task: z.literal('summary_monthly_review'), context: monthlyReviewContext }),
    z.object(documentFields)
]);

export type EvalCase = z.infer<typeof evalCaseSchema>;
export type EvalTask = EvalCase['task'];
export type AskTask = 'ask_vera_step' | 'ask_vera_app_step';
export type SummaryCase = Extract<EvalCase, { task: 'summary_month' | 'summary_cuts' | 'summary_portfolio' | 'summary_monthly_review' }>;
export type DocumentCase = Extract<EvalCase, { task: 'market_document_summary' }>;
export type AskCase = Extract<EvalCase, { task: AskTask }>;

export function isAskCase(item: EvalCase): item is AskCase {
    return item.task === 'ask_vera_step' || item.task === 'ask_vera_app_step';
}

export function isDocumentCase(item: EvalCase): item is DocumentCase {
    return item.task === 'market_document_summary';
}
