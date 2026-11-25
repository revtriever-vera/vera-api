import { helpEntry } from './help-entry';
import { HelpEntry } from './help.types';

export const PORTFOLIO_HELP_ENTRIES: readonly HelpEntry[] = [
    helpEntry({
        id: 'portfolio-overview',
        pt: {
            title: 'Visão geral da carteira',
            body: 'Mostra quanto você tem em cada classe de ativo e quanto isso se afasta da carteira-alvo. Classes fora da faixa de tolerância aparecem em alerta. Com duas pessoas ou mais na conta, dá para filtrar por titular.'
        },
        en: {
            title: 'Portfolio overview',
            body: 'Shows how much you hold in each asset class and how far that is from your target portfolio. Classes outside the tolerance band show an alert. With two or more people on the account, you can filter by holder.'
        },
        screen: { path: '/portfolio', pt: 'Visão geral', en: 'Overview' },
        keywords: ['visão geral', 'overview', 'patrimônio', 'net worth', 'carteira', 'portfolio', 'distribuição', 'alocação', 'allocation'],
        synonyms: [
            'quanto tenho',
            'how much do i have',
            'resumo da carteira',
            'classes de ativo',
            'asset classes',
            'alerta',
            'fora da meta'
        ]
    }),
    helpEntry({
        id: 'portfolio-assets',
        pt: {
            title: 'Meus ativos',
            body: 'Lista os ativos da carteira por classe. A renda variável tem só a quantidade; a renda fixa tem aplicação, taxa e datas, e é valorizada todo dia. O cadastro é manual. O mesmo ativo não entra duas vezes para o mesmo titular.',
            steps: ['Abra Meus ativos.', 'Escolha Adicionar ativo.', 'Informe o ativo e a quantidade ou o valor aplicado.']
        },
        en: {
            title: 'My assets',
            body: 'Lists the portfolio assets by class. Variable income takes only a quantity; fixed income takes the amount invested, the rate and the dates, and is revalued every day. Entry is manual. The same asset cannot be added twice for the same holder.',
            steps: ['Open My assets.', 'Choose Add asset.', 'Enter the asset and the quantity or the amount invested.']
        },
        screen: { path: '/portfolio/assets', pt: 'Meus ativos', en: 'My assets' },
        minRole: 'editor',
        keywords: [
            'ativos',
            'assets',
            'adicionar ativo',
            'add asset',
            'cadastrar ativo',
            'ações',
            'stocks',
            'fiis',
            'etf',
            'quantidade',
            'posição'
        ],
        synonyms: [
            'registrar investimento',
            'cadastrar investimento',
            'add investment',
            'incluir ativo',
            'excluir ativo',
            'titular',
            'holder'
        ]
    }),
    helpEntry({
        id: 'portfolio-targets',
        pt: {
            title: 'Carteira-alvo',
            body: 'Define quanto do patrimônio você quer em cada classe e, dentro da classe, quanto em cada ativo. A visão geral recalcula quando você salva. A faixa de tolerância evita alerta por desvios pequenos. As metas das classes precisam somar 100%.',
            steps: ['Abra Carteira-alvo.', 'Ajuste o percentual de cada classe.', 'Salve. Para o detalhe por ativo, abra a classe.']
        },
        en: {
            title: 'Target portfolio',
            body: 'Sets how much of your net worth you want in each class and, inside a class, in each asset. The overview recalculates when you save. The tolerance band avoids alerts for small deviations. Class targets must add up to 100%.',
            steps: ['Open Target portfolio.', 'Adjust the percentage of each class.', 'Save. For the per-asset split, open the class.']
        },
        screen: { path: '/portfolio/targets', pt: 'Carteira-alvo', en: 'Target portfolio' },
        minRole: 'editor',
        keywords: [
            'carteira-alvo',
            'carteira alvo',
            'target portfolio',
            'meta por classe',
            'percentual',
            'tolerância',
            'tolerance',
            'rebalancear'
        ],
        synonyms: [
            'definir meta',
            'mudar meta',
            'change target',
            'quanto quero em cada classe',
            'faixa de tolerância',
            'carteira ideal',
            'alocação ideal'
        ]
    }),
    helpEntry({
        id: 'portfolio-contribution',
        pt: {
            title: 'Onde aportar',
            body: 'Você diz quanto vai investir e a Vera divide o valor entre as classes que estão abaixo da meta, sem vender nada. Objetivos atrasados recebem primeiro, se você deixar a opção ligada. Precisa de ativos e de carteira-alvo cadastrados.',
            steps: ['Abra Onde aportar.', 'Informe o valor do aporte.', 'Veja a divisão por classe.']
        },
        en: {
            title: 'Where to contribute',
            body: 'You enter how much you will invest and Vera splits it across the classes that are below target, selling nothing. Late goals receive first if you leave that option on. It needs assets and a target portfolio to be set up.',
            steps: ['Open Where to contribute.', 'Enter the contribution amount.', 'See the split by class.']
        },
        screen: { path: '/portfolio/contribution', pt: 'Onde aportar', en: 'Where to contribute' },
        keywords: ['onde aportar', 'where to contribute', 'aporte', 'aportar', 'contribution', 'contribute', 'investir'],
        synonyms: [
            'quanto investir em cada classe',
            'dividir o aporte',
            'split contribution',
            'onde colocar o dinheiro',
            'where to put money',
            'aporte inteligente'
        ]
    }),
    helpEntry({
        id: 'portfolio-goals',
        pt: {
            title: 'Objetivos',
            body: 'Cada objetivo tem um valor e uma data. A Vera calcula quanto falta e quanto guardar por mês com os ativos que você já tem, sem contar rendimento futuro. A reserva de emergência usa os meses de gasto que você escolher: 3 para renda estável, 12 para renda variável.',
            steps: ['Abra Objetivos.', 'Escolha Novo objetivo.', 'Diga quanto e até quando.']
        },
        en: {
            title: 'Goals',
            body: 'Each goal has an amount and a date. Vera calculates what is missing and how much to save each month with the assets you already have, without counting future returns. The emergency fund uses the months of spending you choose: 3 for steady income, 12 for variable income.',
            steps: ['Open Goals.', 'Choose New goal.', 'Say how much and by when.']
        },
        screen: { path: '/portfolio/goals', pt: 'Objetivos', en: 'Goals' },
        minRole: 'editor',
        keywords: ['objetivos', 'goals', 'objetivo', 'goal', 'reserva de emergência', 'emergency fund', 'reserva', 'quanto guardar'],
        synonyms: ['criar objetivo', 'create goal', 'meta de patrimônio', 'sonho', 'quanto falta', 'how much is missing', 'guardar por mês']
    }),
    helpEntry({
        id: 'fixed-income-maturities',
        pt: {
            title: 'Renda fixa e vencimentos',
            body: 'Na aba Renda fixa de Meus ativos, a Vera mostra a taxa real e o poder de compra de cada título, a cobertura do FGC por emissor e os próximos vencimentos, com o valor bruto estimado na data. Quando um título vence, o botão Realocar leva a Onde aportar.',
            steps: ['Abra Meus ativos.', 'Escolha a aba Renda fixa.', 'Veja Próximos vencimentos e use Realocar.']
        },
        en: {
            title: 'Fixed income and maturities',
            body: 'On the Fixed income tab of My assets, Vera shows each bond real rate and purchasing power, FGC coverage by issuer and the upcoming maturities, with the estimated gross value on the date. When a bond matures, the Reallocate button leads to Where to contribute.',
            steps: ['Open My assets.', 'Choose the Fixed income tab.', 'See Upcoming maturities and use Reallocate.']
        },
        screen: { path: '/portfolio/assets', pt: 'Meus ativos', en: 'My assets' },
        keywords: [
            'renda fixa',
            'fixed income',
            'vencimentos',
            'maturities',
            'vencimento',
            'maturity',
            'fgc',
            'cdb',
            'lci',
            'lca',
            'tesouro'
        ],
        synonyms: [
            'quando vence',
            'when does it mature',
            'taxa real',
            'real rate',
            'poder de compra',
            'realocar',
            'reallocate',
            'título vence',
            'agenda de vencimentos'
        ]
    }),
    helpEntry({
        id: 'portfolio-import-operations',
        pt: {
            title: 'Importar operações da B3',
            body: 'Envie o relatório da B3 em Excel (.xlsx) ou CSV, de até 10 MB. A Vera mostra cada linha, os proventos e o efeito na carteira, e você confirma antes de gravar. Proventos entram no histórico e não mudam a posição. Importações anteriores ficam listadas.',
            steps: ['Abra Meus ativos.', 'Escolha Importar operações.', 'Envie o relatório, confira as linhas e confirme.']
        },
        en: {
            title: 'Import B3 trades',
            body: 'Send the B3 report as an Excel (.xlsx) or CSV file, up to 10 MB. Vera shows each line, the income and the effect on the portfolio, and you confirm before anything is saved. Income goes to the history and does not change the position. Earlier imports stay listed.',
            steps: ['Open My assets.', 'Choose Import trades.', 'Send the report, check the lines and confirm.']
        },
        screen: { path: '/portfolio/assets', pt: 'Meus ativos', en: 'My assets' },
        minRole: 'editor',
        keywords: [
            'importar operações',
            'import trades',
            'b3',
            'relatório da b3',
            'b3 report',
            'proventos',
            'income',
            'dividendos',
            'dividends'
        ],
        synonyms: ['importar carteira', 'import portfolio', 'subir planilha da b3', 'upload b3', 'xlsx', 'excel']
    })
];
