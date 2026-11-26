import { helpEntry } from './help-entry';
import { HelpEntry } from './help.types';

export const SPENDING_HELP_ENTRIES: readonly HelpEntry[] = [
    helpEntry({
        id: 'spending-summary',
        pt: {
            title: 'Resumo do mês',
            body: 'Mostra a renda, os gastos e quanto sobrou no mês, por categoria. Meses ainda abertos têm números parciais. Transações sem categoria ficam fora da conta até você categorizar. Escolha outro mês para comparar.'
        },
        en: {
            title: 'Month summary',
            body: 'Shows income, spending and what is left for the month, by category. Months still open have partial numbers. Transactions with no category stay out of the math until you categorize them. Pick another month to compare.'
        },
        screen: { path: '/spending', pt: 'Resumo do mês', en: 'Month summary' },
        keywords: [
            'resumo do mês',
            'month summary',
            'gastos',
            'spending',
            'despesas',
            'expenses',
            'renda',
            'income',
            'sobrou',
            'left over'
        ],
        synonyms: [
            'quanto gastei',
            'how much did i spend',
            'gastos por categoria',
            'spending by category',
            'balanço do mês',
            'fechamento do mês'
        ]
    }),
    helpEntry({
        id: 'spending-transactions',
        pt: {
            title: 'Transações',
            body: 'Lista as transações do mês. A maior parte é classificada pela categoria do banco, por um dicionário de estabelecimentos e pelas suas regras. O que sobra, você categoriza uma vez e marca Sempre para criar uma regra. Pix para pessoa física costuma ficar sem categoria.',
            steps: ['Abra Transações.', 'Escolha a categoria da transação.', 'Marque Sempre para criar a regra.']
        },
        en: {
            title: 'Transactions',
            body: 'Lists the transactions of the month. Most are classified by the bank category, a merchant dictionary and your own rules. For the rest, you pick a category once and tick Always to create a rule. Pix to a person usually stays uncategorized.',
            steps: ['Open Transactions.', 'Choose the category of the transaction.', 'Tick Always to create the rule.']
        },
        screen: { path: '/spending/transactions', pt: 'Transações', en: 'Transactions' },
        minRole: 'editor',
        keywords: [
            'transações',
            'transactions',
            'categorizar',
            'categorize',
            'sem categoria',
            'uncategorized',
            'trocar categoria',
            'change category'
        ],
        synonyms: ['corrigir categoria', 'fix category', 'lançamentos', 'extrato', 'statement', 'ver gastos', 'pix sem categoria']
    }),
    helpEntry({
        id: 'spending-recurring',
        pt: {
            title: 'Assinaturas e contas',
            body: 'Mostra o que se repete no seu extrato, quanto custa por mês e por ano. Com 3 meses de extrato a Vera acha as cobranças e você confirma. Sugestões não entram nos totais até a confirmação. A Vera não cancela nada: cancele no app ou no site do serviço.'
        },
        en: {
            title: 'Subscriptions and bills',
            body: 'Shows what repeats in your statement and what it costs per month and per year. With 3 months of statements Vera finds the charges and you confirm them. Suggestions stay out of the totals until confirmed. Vera does not cancel anything: cancel in the service app or website.'
        },
        screen: { path: '/spending/recurring', pt: 'Assinaturas e contas', en: 'Subscriptions and bills' },
        minRole: 'editor',
        keywords: [
            'assinaturas',
            'subscriptions',
            'recorrentes',
            'recurring',
            'contas fixas',
            'bills',
            'cobranças',
            'charges',
            'mensalidade'
        ],
        synonyms: [
            'quanto pago de assinatura',
            'cancelar assinatura',
            'cancel subscription',
            'streaming',
            'cobrança repetida',
            'gastos fixos'
        ]
    }),
    helpEntry({
        id: 'spending-cuts',
        pt: {
            title: 'Onde cortar',
            body: 'Compara sua meta de economia com o que você guardou e sugere um limite por categoria. Começa pelo que subiu acima da sua média e só passa disso se ainda faltar. Mexer no controle apenas simula; a meta só vale no resumo do mês depois de salva.'
        },
        en: {
            title: 'Where to cut',
            body: 'Compares your savings goal with what you saved and suggests a limit for each category. It starts with what rose above your average and goes beyond that only if something is still missing. Moving the slider only simulates; the goal counts in the month summary once saved.'
        },
        screen: { path: '/spending/cuts', pt: 'Onde cortar', en: 'Where to cut' },
        keywords: [
            'onde cortar',
            'where to cut',
            'cortes',
            'cuts',
            'limites',
            'limits',
            'cortar gastos',
            'cut spending',
            'economizar',
            'save money'
        ],
        synonyms: ['reduzir gastos', 'reduce spending', 'limite por categoria', 'category limit', 'sugestão de corte', 'gastar menos']
    }),
    helpEntry({
        id: 'savings-goal',
        pt: {
            title: 'Meta de economia',
            body: 'É a parte da renda que você quer guardar por mês, em porcentagem. Você a ajusta em Onde cortar e salva. Sem renda registrada no mês, a meta não é calculada. Se você guardar mais que a meta, o que passou pode ir direto para Onde aportar.',
            steps: ['Abra Onde cortar.', 'Mova o controle Meta de economia.', 'Escolha Salvar meta.']
        },
        en: {
            title: 'Savings goal',
            body: 'It is the share of your income you want to save each month, as a percentage. You adjust it in Where to cut and save it. With no income recorded for the month, the goal is not calculated. If you save more than the goal, the extra can go straight to Where to contribute.',
            steps: ['Open Where to cut.', 'Move the Savings goal slider.', 'Choose Save goal.']
        },
        screen: { path: '/spending/cuts', pt: 'Onde cortar', en: 'Where to cut' },
        minRole: 'editor',
        keywords: ['meta de economia', 'savings goal', 'taxa de poupança', 'savings rate', 'guardar por mês', 'save per month', 'meta'],
        synonyms: [
            'mudar a meta de economia',
            'change savings goal',
            'quanto quero guardar',
            'porcentagem da renda',
            'percent of income',
            'definir renda'
        ]
    }),
    helpEntry({
        id: 'categories-and-rules',
        pt: {
            title: 'Categorias e regras',
            body: 'Uma regra manda as transações parecidas sempre para a mesma categoria. Ela vale mais que o dicionário e que o banco, e menos que uma correção sua. A regra compara a descrição inteira ou parte dela, para saídas, entradas ou ambas. Excluir uma regra devolve as transações à categorização automática.',
            steps: ['Abra Regras.', 'Escolha Nova regra.', 'Defina o texto, o sentido e a categoria.']
        },
        en: {
            title: 'Categories and rules',
            body: 'A rule always sends similar transactions to the same category. It outranks the dictionary and the bank, and ranks below a correction of yours. The rule matches the whole description or part of it, for outflows, inflows or both. Deleting a rule returns the transactions to automatic categorization.',
            steps: ['Open Rules.', 'Choose New rule.', 'Set the text, the direction and the category.']
        },
        screen: { path: '/spending/rules', pt: 'Regras', en: 'Rules' },
        minRole: 'editor',
        keywords: ['regras', 'rules', 'categorias', 'categories', 'regra de categoria', 'category rule', 'nova regra', 'new rule'],
        synonyms: [
            'sempre categorizar',
            'always categorize',
            'criar categoria',
            'automatizar categoria',
            'excluir regra',
            'delete rule',
            'categorização automática'
        ]
    }),
    helpEntry({
        id: 'import-statement',
        pt: {
            title: 'Importar extrato',
            body: 'Funciona com qualquer banco: exporte o extrato ou a fatura em OFX ou CSV, de até 5 MB, e envie. Você confere a prévia antes de importar. Se o CSV for de outro formato, indique onde estão a data, a descrição e o valor. Importar o mesmo arquivo de novo ignora as transações repetidas.',
            steps: ['Abra Bancos, em Configurações.', 'Escolha Importar extrato.', 'Envie o arquivo, confira a prévia e importe.']
        },
        en: {
            title: 'Import a statement',
            body: 'It works with any bank: export the statement or card bill as OFX or CSV, up to 5 MB, and send it. You check the preview before importing. If the CSV has another format, say where the date, the description and the amount are. Importing the same file again skips repeated transactions.',
            steps: ['Open Banks, in Settings.', 'Choose Import statement.', 'Send the file, check the preview and import.']
        },
        screen: { path: '/settings/banks', pt: 'Bancos', en: 'Banks' },
        minRole: 'editor',
        keywords: ['importar extrato', 'import statement', 'ofx', 'csv', 'extrato', 'statement', 'fatura', 'card bill', 'importar'],
        synonyms: ['subir extrato', 'upload statement', 'enviar arquivo do banco', 'baixar extrato', 'importar fatura', 'planilha do banco']
    }),
    helpEntry({
        id: 'connect-bank',
        pt: {
            title: 'Conectar banco',
            body: 'Os extratos chegam pelo Open Finance, usando a sua própria conta gratuita no Meu Pluggy. O passo a passo leva uns 10 a 15 minutos, uma vez só. A senha do banco nunca passa pela Vera nem pela Pluggy. Só o Dono da conta cadastra e troca as credenciais.',
            steps: ['Abra Bancos, em Configurações.', 'Escolha Ver passo a passo.', 'Cole as credenciais e escolha Testar e conectar.']
        },
        en: {
            title: 'Connect a bank',
            body: 'Statements arrive through Open Finance, using your own free Meu Pluggy account. The walkthrough takes about 10 to 15 minutes, once. The bank password never goes through Vera or Pluggy. Only the account Owner sets and changes the credentials.',
            steps: ['Open Banks, in Settings.', 'Choose Show walkthrough.', 'Paste the credentials and choose Test and connect.']
        },
        screen: { path: '/settings/banks', pt: 'Bancos', en: 'Banks' },
        minRole: 'owner',
        keywords: ['conectar banco', 'connect bank', 'open finance', 'pluggy', 'meu pluggy', 'bancos', 'banks', 'conexão', 'connection'],
        synonyms: [
            'ligar o banco',
            'link bank account',
            'sincronizar banco',
            'sync bank',
            'item id',
            'client id',
            'credenciais',
            'credentials',
            'integração com banco'
        ]
    })
];
