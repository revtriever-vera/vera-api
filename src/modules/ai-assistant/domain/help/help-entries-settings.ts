import { helpEntry } from './help-entry';
import { HelpEntry } from './help.types';

export const SETTINGS_HELP_ENTRIES: readonly HelpEntry[] = [
    helpEntry({
        id: 'settings',
        pt: {
            title: 'Configurações',
            body: 'Reúne o plano e o uso, as pessoas da conta, o WhatsApp, o Google Agenda, os bancos, as preferências e os dados e a privacidade. Na versão auto-hospedada, Integrações ocupa o lugar de Plano e uso. Cada seção é uma aba.'
        },
        en: {
            title: 'Settings',
            body: 'Gathers the plan and usage, the people on the account, WhatsApp, Google Calendar, banks, preferences, and data and privacy. In the self-hosted version, Integrations takes the place of Plan and usage. Each section is a tab.'
        },
        screen: { path: '/settings', pt: 'Configurações', en: 'Settings' },
        keywords: ['configurações', 'settings', 'ajustes', 'abas', 'tabs', 'preferências'],
        synonyms: ['onde fica configuração', 'where are settings', 'opções da conta', 'account options']
    }),
    helpEntry({
        id: 'settings-plan',
        pt: {
            title: 'Plano e uso',
            body: 'Mostra o seu plano, a cota do mês, a assinatura e a forma de pagamento, em Pix ou cartão. Só o Dono da conta muda o plano. Um Premium por conta vale para todas as pessoas. Cancele quando quiser, sem multa.',
            steps: ['Abra Configurações.', 'Escolha a aba Plano e uso.']
        },
        en: {
            title: 'Plan and usage',
            body: 'Shows your plan, the quota for the month, the subscription and the payment method, Pix or card. Only the account Owner changes the plan. One Premium per account covers every person. Cancel any time, with no fee.',
            steps: ['Open Settings.', 'Choose the Plan and usage tab.']
        },
        screen: { path: '/settings/plan', pt: 'Plano e uso', en: 'Plan and usage' },
        minRole: 'owner',
        keywords: [
            'plano',
            'plan',
            'assinatura',
            'subscription',
            'assinar',
            'subscribe',
            'cancelar premium',
            'cancel premium',
            'pagamento',
            'payment',
            'cartão'
        ],
        synonyms: ['trocar de plano', 'change plan', 'mudar pagamento', 'pagar com pix', 'fatura da vera', 'cota do mês', 'monthly quota']
    }),
    helpEntry({
        id: 'settings-integrations',
        pt: {
            title: 'Integrações da instalação',
            body: 'Na versão auto-hospedada, é onde você cadastra as suas chaves: modelo de linguagem, WhatsApp e Google. Sem a chave, a função some da tela. Essa versão não tem plano Free nem Premium e não depende da Revtriever.'
        },
        en: {
            title: 'Installation integrations',
            body: 'In the self-hosted version, this is where you register your own keys: language model, WhatsApp and Google. Without the key, the feature disappears from the screen. That version has no Free or Premium plan and does not depend on Revtriever.'
        },
        screen: { path: '/settings/integrations', pt: 'Integrações', en: 'Integrations' },
        minRole: 'owner',
        keywords: ['integrações', 'integrations', 'chaves', 'keys', 'api key', 'chave de api', 'auto-hospedada', 'self-hosted'],
        synonyms: ['cadastrar chave', 'register key', 'configurar modelo', 'configure model', 'servidor próprio', 'own server']
    }),
    helpEntry({
        id: 'settings-people',
        pt: {
            title: 'Pessoas e papéis',
            body: 'O Dono convida pessoas por e-mail, e elas entram com Google ou Facebook pelo link. Cada pessoa tem um papel. Dono: pode tudo, inclusive o plano e as pessoas. Editor: mexe em carteira e gastos. Leitura: só vê. O único Dono precisa passar o papel a outra pessoa antes de sair.',
            steps: ['Abra Pessoas, em Configurações.', 'Escolha Convidar.', 'Informe o e-mail e o papel.']
        },
        en: {
            title: 'People and roles',
            body: 'The Owner invites people by email, and they sign in with Google or Facebook through the link. Each person has a role. Owner: can do everything, including the plan and the people. Editor: changes portfolio and spending. Viewer: view only. The only Owner must hand the role to someone else before leaving.',
            steps: ['Open People, in Settings.', 'Choose Invite.', 'Enter the email and the role.']
        },
        screen: { path: '/settings/people', pt: 'Pessoas', en: 'People' },
        minRole: 'owner',
        keywords: [
            'pessoas',
            'people',
            'papéis',
            'roles',
            'convidar',
            'invite',
            'dono',
            'owner',
            'editor',
            'leitura',
            'viewer',
            'membros',
            'members'
        ],
        synonyms: [
            'adicionar pessoa',
            'add person',
            'compartilhar a conta',
            'share account',
            'permissões',
            'permissions',
            'remover pessoa',
            'sair da conta',
            'cônjuge'
        ]
    }),
    helpEntry({
        id: 'settings-whatsapp',
        pt: {
            title: 'Vera no WhatsApp',
            body: 'Vincule o seu número para perguntar sobre carteira e gastos, marcar reuniões e criar lembretes por mensagem. A Vera só responde ao número que mandar o código. Pix e pagamentos ficam de fora: ela só lê os seus dados. É do Premium.',
            steps: ['Abra WhatsApp, em Configurações.', 'Escolha Vincular seu WhatsApp.', 'Mande o código pelo celular ou pelo QR.']
        },
        en: {
            title: 'Vera on WhatsApp',
            body: 'Link your number to ask about portfolio and spending, schedule meetings and create reminders by message. Vera only answers the number that sends the code. Pix and payments are out: it only reads your data. It is a Premium feature.',
            steps: ['Open WhatsApp, in Settings.', 'Choose Link your WhatsApp.', 'Send the code from your phone or by QR.']
        },
        screen: { path: '/settings/whatsapp', pt: 'WhatsApp', en: 'WhatsApp' },
        plans: 'premium',
        keywords: ['whatsapp', 'vincular', 'link number', 'número', 'phone number', 'lembretes', 'reminders', 'zap'],
        synonyms: [
            'conectar whatsapp',
            'connect whatsapp',
            'desvincular',
            'unlink',
            'mandar mensagem para a vera',
            'message vera',
            'código do whatsapp'
        ]
    }),
    helpEntry({
        id: 'settings-calendar',
        pt: {
            title: 'Google Agenda',
            body: 'Conecta o Google Agenda para marcar reuniões e receber lembretes pelo WhatsApp. A permissão é pedida só ao conectar, nunca no login. É do Premium.',
            steps: ['Abra Google Agenda, em Configurações.', 'Escolha Conectar.', 'Autorize o acesso na tela do Google.']
        },
        en: {
            title: 'Google Calendar',
            body: 'Connects Google Calendar to schedule meetings and get reminders on WhatsApp. The permission is asked only when you connect, never at sign-in. It is a Premium feature.',
            steps: ['Open Google Calendar, in Settings.', 'Choose Connect.', 'Allow access on the Google screen.']
        },
        screen: { path: '/settings/calendar', pt: 'Google Agenda', en: 'Google Calendar' },
        plans: 'premium',
        keywords: ['google agenda', 'google calendar', 'agenda', 'calendar', 'reuniões', 'meetings', 'calendário'],
        synonyms: ['conectar agenda', 'connect calendar', 'marcar reunião', 'schedule meeting', 'permissão do google']
    }),
    helpEntry({
        id: 'settings-preferences',
        pt: {
            title: 'Preferências',
            body: 'Aqui você troca o idioma dos textos da interface e das respostas, entre português e inglês, e escolhe quais avisos recebe por e-mail.',
            steps: ['Abra Preferências, em Configurações.', 'Escolha o idioma ou os avisos.']
        },
        en: {
            title: 'Preferences',
            body: 'Here you change the language of the interface texts and of the answers, between Portuguese and English, and choose which notices you receive by email.',
            steps: ['Open Preferences, in Settings.', 'Choose the language or the notices.']
        },
        screen: { path: '/settings/preferences', pt: 'Preferências', en: 'Preferences' },
        keywords: [
            'preferências',
            'preferences',
            'idioma',
            'language',
            'avisos',
            'notices',
            'notificações',
            'notifications',
            'perfil',
            'profile'
        ],
        synonyms: [
            'mudar idioma',
            'change language',
            'inglês',
            'english',
            'português',
            'portuguese',
            'parar de receber e-mail',
            'unsubscribe'
        ]
    }),
    helpEntry({
        id: 'settings-privacy',
        pt: {
            title: 'Dados e privacidade',
            body: 'Reúne a permissão para enviar totais agregados a um modelo de linguagem, a exportação e a exclusão da conta, e a lista de acessos do suporte. Toda vez que alguém da equipe abre os dados da conta, precisa dar um motivo, e cada abertura fica registrada.',
            steps: ['Abra Dados e privacidade, em Configurações.']
        },
        en: {
            title: 'Data and privacy',
            body: 'Gathers the permission to send aggregated totals to a language model, the export and deletion of the account, and the list of support accesses. Every time someone from the team opens the account data, they must give a reason, and each access is recorded.',
            steps: ['Open Data and privacy, in Settings.']
        },
        screen: { path: '/settings/privacy', pt: 'Dados e privacidade', en: 'Data and privacy' },
        keywords: ['dados e privacidade', 'data and privacy', 'privacidade', 'privacy', 'suporte', 'support access', 'lgpd', 'dados'],
        synonyms: [
            'quem vê meus dados',
            'who sees my data',
            'acessos do suporte',
            'permissão de envio',
            'desligar envio',
            'turn off sending'
        ]
    }),
    helpEntry({
        id: 'export-account',
        pt: {
            title: 'Exportar os seus dados',
            body: 'Exportar tudo gera uma planilha com carteira, metas, transações, regras de categoria e lembretes. Os dados são seus. Só o Dono da conta exporta.',
            steps: ['Abra Dados e privacidade, em Configurações.', 'Escolha Exportar tudo.']
        },
        en: {
            title: 'Export your data',
            body: 'Export everything creates a spreadsheet with portfolio, goals, transactions, category rules and reminders. The data is yours. Only the account Owner can export.',
            steps: ['Open Data and privacy, in Settings.', 'Choose Export everything.']
        },
        screen: { path: '/settings/privacy', pt: 'Dados e privacidade', en: 'Data and privacy' },
        minRole: 'owner',
        keywords: ['exportar', 'export', 'planilha', 'spreadsheet', 'baixar dados', 'download data', 'backup'],
        synonyms: ['levar meus dados', 'take my data', 'exportar carteira', 'exportar transações', 'export transactions', 'cópia dos dados']
    }),
    helpEntry({
        id: 'delete-account',
        pt: {
            title: 'Excluir a conta',
            body: 'Excluir apaga a conta e todos os dados e desconecta bancos, WhatsApp e Google. Com Premium, cancela também a assinatura. Exporte antes se quiser guardar os dados. Só o Dono da conta exclui.',
            steps: ['Abra Dados e privacidade, em Configurações.', 'Escolha Excluir conta e confirme.']
        },
        en: {
            title: 'Delete the account',
            body: 'Deleting erases the account and all data and disconnects banks, WhatsApp and Google. With Premium, it also cancels the subscription. Export first if you want to keep the data. Only the account Owner can delete.',
            steps: ['Open Data and privacy, in Settings.', 'Choose Delete account and confirm.']
        },
        screen: { path: '/settings/privacy', pt: 'Dados e privacidade', en: 'Data and privacy' },
        minRole: 'owner',
        keywords: ['excluir conta', 'delete account', 'apagar conta', 'encerrar conta', 'close account', 'apagar dados', 'erase data'],
        synonyms: ['quero sair da vera', 'cancelar a conta', 'cancel account', 'remover tudo', 'delete everything']
    })
];
