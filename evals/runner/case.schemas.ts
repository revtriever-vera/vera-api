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

const askCase = z.object({
    ...common,
    task: z.literal('ask_vera_step'),
    question: z.string().min(1),
    history: z.array(z.object({ role: z.enum(['person', 'vera']), text: z.string() })),
    tools: z.object({ required: z.array(z.string()), allowed: z.array(z.string()) }),
    mockTools: z.array(z.object({ name: z.string(), input: z.record(z.string(), z.unknown()) }))
});

export const evalCaseSchema = z.discriminatedUnion('task', [
    askCase,
    z.object({ ...common, task: z.literal('summary_month'), context: monthContext }),
    z.object({ ...common, task: z.literal('summary_cuts'), context: cutsContext }),
    z.object({ ...common, task: z.literal('summary_portfolio'), context: portfolioContext })
]);

export type EvalCase = z.infer<typeof evalCaseSchema>;
export type EvalTask = EvalCase['task'];
export type SummaryCase = Exclude<EvalCase, { task: 'ask_vera_step' }>;
export type AskCase = Extract<EvalCase, { task: 'ask_vera_step' }>;
