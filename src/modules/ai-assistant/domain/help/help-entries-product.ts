import { helpEntry } from './help-entry';
import { HelpEntry } from './help.types';

export const PRODUCT_HELP_ENTRIES: readonly HelpEntry[] = [
    helpEntry({
        id: 'plan-free',
        pt: {
            title: 'O que o Free inclui',
            body: 'O Free tem a carteira e os gastos completos, sem custo e sem prazo: ativos, carteira-alvo, Onde aportar, objetivos, renda fixa, Open Finance, importação de extrato, categorias e regras, Onde cortar, assinaturas, pessoas na conta e exportação em planilha. O que usa modelo de linguagem ou WhatsApp é do Premium.'
        },
        en: {
            title: 'What Free includes',
            body: 'Free has the full portfolio and spending, at no cost and with no time limit: assets, target portfolio, Where to contribute, goals, fixed income, Open Finance, statement import, categories and rules, Where to cut, subscriptions, people on the account and spreadsheet export. Whatever uses a language model or WhatsApp is Premium.'
        },
        screen: { path: '/settings/plan', pt: 'Plano e uso', en: 'Plan and usage' },
        minRole: 'owner',
        keywords: ['free', 'grátis', 'gratuito', 'plano free', 'free plan', 'sem custo', 'no cost', 'o que inclui', 'what is included'],
        synonyms: ['é de graça', 'is it free', 'o que é pago', 'what is paid', 'tem custo', 'quanto custa usar', 'limites do free']
    }),
    helpEntry({
        id: 'plan-premium',
        pt: {
            title: 'O que o Premium inclui',
            body: 'O Premium custa R$ 14,90 por mês, em Pix ou cartão, e vale para todas as pessoas da conta. Inclui resumos em texto, a Vera no WhatsApp, o Google Agenda com lembretes e as respostas sobre os seus números em Perguntar à Vera. Nada do que é grátis passa a ser pago. Cancele quando quiser, sem multa.'
        },
        en: {
            title: 'What Premium includes',
            body: 'Premium costs R$ 14.90 per month, by Pix or card, and covers every person on the account. It includes text summaries, Vera on WhatsApp, Google Calendar with reminders and answers about your numbers in Ask Vera. Nothing that is free becomes paid. Cancel any time, with no fee.'
        },
        screen: { path: '/settings/plan', pt: 'Plano e uso', en: 'Plan and usage' },
        minRole: 'owner',
        plans: 'premium',
        keywords: [
            'premium',
            'preço',
            'price',
            'quanto custa',
            'how much',
            'r$ 14,90',
            'assinar o premium',
            'subscribe to premium',
            'valor'
        ],
        synonyms: [
            'o que o premium tem',
            'what does premium have',
            'vale a pena o premium',
            'tem teste grátis',
            'free trial',
            'trial',
            'mensalidade'
        ]
    }),
    helpEntry({
        id: 'premium-quota',
        pt: {
            title: 'Cota de uso do Premium',
            body: 'Resumos e WhatsApp dividem uma cota mensal de uso por conta, mostrada em porcentagem. Há aviso perto do teto. Em 100%, essas funções pausam até o mês virar, sem cobrança extra, e o resto da Vera segue normal. A cota cobre o uso normal de um mês.'
        },
        en: {
            title: 'Premium usage quota',
            body: 'Summaries and WhatsApp share a monthly usage quota per account, shown as a percentage. There is a warning near the limit. At 100%, those features pause until the month turns, with no extra charge, and the rest of Vera keeps working. The quota covers normal use for a month.'
        },
        screen: { path: '/settings/plan', pt: 'Plano e uso', en: 'Plan and usage' },
        minRole: 'owner',
        plans: 'premium',
        keywords: ['cota', 'quota', 'limite de uso', 'usage limit', 'pausado', 'paused', 'cota esgotada', 'quota used up', 'teto'],
        synonyms: [
            'por que pausou',
            'why did it pause',
            'quando volta',
            'when does it return',
            'cobrança extra',
            'extra charge',
            'acabou a cota'
        ]
    }),
    helpEntry({
        id: 'summaries',
        pt: {
            title: 'Resumos em texto',
            body: 'No Premium, a Vera escreve em 3 ou 4 frases o que mudou no mês, como chegar à meta de economia e o que está fora da meta na carteira. Os resumos aparecem nas telas Resumo do mês, Onde cortar e Visão geral. Antes do primeiro, você precisa permitir o envio de totais agregados.'
        },
        en: {
            title: 'Text summaries',
            body: 'On Premium, Vera writes in 3 or 4 sentences what changed in the month, how to reach the savings goal and what is off target in the portfolio. Summaries appear on the Month summary, Where to cut and Overview screens. Before the first one, you must allow sending aggregated totals.'
        },
        screen: { path: '/spending', pt: 'Resumo do mês', en: 'Month summary' },
        plans: 'premium',
        keywords: ['resumos', 'summaries', 'resumo em texto', 'text summary', 'explicação', 'explanation'],
        synonyms: [
            'por que gastei mais',
            'why did i spend more',
            'explicar o mês',
            'explain the month',
            'texto sobre meus números',
            'o que mudou no mês'
        ]
    }),
    helpEntry({
        id: 'send-permission',
        pt: {
            title: 'Permissão de envio de dados',
            body: 'Para os resumos, a Vera envia totais agregados a um modelo de linguagem, por um serviço da Vercel. Nomes de pessoas e de estabelecimentos, descrições das transações, contas e credenciais nunca são enviados. Em Ver o que é enviado você confere o conteúdo. Desligado, nada é enviado e os resumos somem das telas.',
            steps: ['Abra Dados e privacidade, em Configurações.', 'Desligue o envio de totais agregados.']
        },
        en: {
            title: 'Data sending permission',
            body: 'For the summaries, Vera sends aggregated totals to a language model, through a Vercel service. Names of people and merchants, transaction descriptions, accounts and credentials are never sent. In See what is sent you can check the content. When off, nothing is sent and the summaries disappear from the screens.',
            steps: ['Open Data and privacy, in Settings.', 'Turn off sending aggregated totals.']
        },
        screen: { path: '/settings/privacy', pt: 'Dados e privacidade', en: 'Data and privacy' },
        keywords: [
            'permissão',
            'permission',
            'enviado',
            'sent',
            'ver o que é enviado',
            'see what is sent',
            'modelo de linguagem',
            'language model',
            'vercel',
            'totais agregados'
        ],
        synonyms: [
            'o que vocês enviam',
            'what do you send',
            'desligar envio',
            'turn off sending',
            'meus dados vão para onde',
            'where does my data go',
            'privacidade do modelo'
        ]
    }),
    helpEntry({
        id: 'ask-vera',
        pt: {
            title: 'Perguntar à Vera',
            body: 'Painel de perguntas aberto de qualquer tela. No Free, responde como usar a Vera, sem olhar os seus dados. No Premium, com a permissão de envio ligada, responde também sobre os seus gastos e a sua carteira. Só a sua pergunta, sem CPF, e-mail ou telefone, vai a um modelo de linguagem. A ajuda do Free pausa em R$ 0,50 por mês por conta. A conversa fica guardada por 30 dias.'
        },
        en: {
            title: 'Ask Vera',
            body: 'A question panel you can open from any screen. On Free, it answers how to use Vera, without looking at your data. On Premium, with the sending permission on, it also answers about your spending and portfolio. Only your question, without ID numbers, email or phone, goes to a language model. Free help pauses at R$ 0.50 per month per account. The conversation is kept for 30 days.'
        },
        keywords: ['perguntar à vera', 'ask vera', 'painel', 'panel', 'chat', 'conversa', 'conversation', 'pergunta', 'question'],
        synonyms: [
            'falar com a vera',
            'talk to vera',
            'o que a vera responde',
            'what does vera answer',
            'histórico da conversa',
            'apagar conversa',
            'delete conversation',
            'ajuda'
        ]
    }),
    helpEntry({
        id: 'self-hosting',
        pt: {
            title: 'Auto-hospedagem',
            body: 'A Vera é código aberto, sob a licença AGPL-3.0, e pode rodar no seu servidor. Na versão auto-hospedada, você cadastra as suas chaves de modelo de linguagem, WhatsApp e Google em Integrações. Sem a chave, a função some. Essa versão não tem planos nem cobrança.'
        },
        en: {
            title: 'Self-hosting',
            body: 'Vera is open source, under the AGPL-3.0 license, and can run on your own server. In the self-hosted version, you register your own language model, WhatsApp and Google keys in Integrations. Without the key, the feature disappears. That version has no plans and no billing.'
        },
        keywords: [
            'auto-hospedagem',
            'self-hosting',
            'auto-hospedada',
            'self-hosted',
            'código aberto',
            'open source',
            'agpl',
            'servidor',
            'server',
            'github'
        ],
        synonyms: ['rodar no meu servidor', 'run on my server', 'instalar a vera', 'install vera', 'licença', 'license', 'docker']
    }),
    helpEntry({
        id: 'vera-limits',
        pt: {
            title: 'O que a Vera não faz',
            body: 'A Vera não faz Pix nem pagamentos: ela só lê os seus dados. Não recomenda comprar ou vender ativo. Explica, compara e mostra a carteira contra a meta que você definiu. Não classifica transações por modelo de linguagem: a categoria vem do banco, de um dicionário e das suas regras. Não cancela assinaturas.'
        },
        en: {
            title: 'What Vera does not do',
            body: 'Vera does not do Pix or payments: it only reads your data. It does not recommend buying or selling an asset. It explains, compares and shows the portfolio against the target you set. It does not classify transactions with a language model: the category comes from the bank, a dictionary and your rules. It does not cancel subscriptions.'
        },
        keywords: [
            'não faz',
            'does not do',
            'limites',
            'limits',
            'pix',
            'pagamento',
            'payment',
            'recomendação',
            'recommendation',
            'comprar',
            'vender',
            'buy',
            'sell'
        ],
        synonyms: [
            'a vera paga conta',
            'can vera pay',
            'a vera recomenda ação',
            'does vera recommend stocks',
            'o que não dá para fazer',
            'transferir dinheiro',
            'transfer money',
            'consultoria'
        ]
    })
];
