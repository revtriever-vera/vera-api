import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../src/core/context/app-context.port';
import { MockLlmDriver } from '../../src/core/llm/drivers/mock-llm.driver';
import { QueueEnvelope } from '../../src/core/queue/queue.types';
import { PaidUsageMeter } from '../../src/core/usage/services/paid-usage-meter.service';
import { CapReachedError } from '../../src/core/usage/usage.errors';
import { AccountSpreadsheetRegistry } from '../../src/modules/identity/services/account-spreadsheet.registry';
import { UserDomain } from '../../src/modules/identity/domain/user.domain';
import { User } from '../../src/modules/identity/domain/identity.types';
import { AuthTokens, SessionIssuerPort } from '../../src/modules/identity/ports/session-issuer.port';
import { PlanContractService } from '../../src/modules/plans/services/plan-contract.service';
import { PlanGateService } from '../../src/modules/plans/services/plan-gate.service';
import { PremiumLifecycleRegistry } from '../../src/modules/plans/services/premium-lifecycle.registry';
import { ReminderFireHandler } from '../../src/modules/reminders/access/queue/reminder-fire.handler';
import { ReminderFireApplication } from '../../src/modules/reminders/application/reminder-fire.application';
import { ReminderMaintenanceApplication } from '../../src/modules/reminders/application/reminder-maintenance.application';
import { ReminderEngineService } from '../../src/modules/reminders/services/reminder-engine.service';
import { RemindersAccountEraser } from '../../src/modules/reminders/services/reminders-account.eraser';
import { RemindersMemberLifecycle } from '../../src/modules/reminders/services/reminders-member.lifecycle';
import { InboundMessageHandler } from '../../src/modules/whatsapp/access/queue/inbound.handler';
import { MessageSendHandler } from '../../src/modules/whatsapp/access/queue/send.handler';
import { WebhookReceivedHandler } from '../../src/modules/whatsapp/access/queue/webhook.handler';
import { ChannelMaintenanceApplication } from '../../src/modules/whatsapp/application/channel-maintenance.application';
import { MockOutbox, MockSentMessage } from '../../src/modules/whatsapp/services/mock-outbox.service';
import { SignatureVerifier } from '../../src/modules/whatsapp/services/signature.verifier';
import { LinkContactService } from '../../src/modules/whatsapp-link/services/link-contact.service';
import { TurnAnsweredHandler } from '../../src/modules/whatsapp-chat/access/queue/answer.handler';
import { TurnRequestedHandler } from '../../src/modules/whatsapp-chat/access/queue/turn.handler';
import { Account, AllocationHarness } from './support/allocation-harness';
import { CapturingPublisher, PublishedMessage } from './support/queue';

interface IssuedBody {
    readonly code: string;
}

interface ReminderRow {
    readonly id: string;
    readonly text: string;
    readonly kind: string;
    readonly status: string;
    readonly canceledReason: string | null;
    readonly dayOfMonth: number | null;
    readonly timeOfDay: string;
}

interface OccurrenceRow {
    readonly id: string;
    readonly occurrenceAt: Date;
    readonly kind: string;
    readonly status: string;
    readonly channel: string | null;
    readonly messageId: string | null;
}

interface ListBody {
    readonly items: readonly { readonly id: string; readonly text: string; readonly kind: string; readonly nextAt: string | null }[];
}

const HEADERS: Record<string, string> = { 'content-type': 'application/json' };
const PHONE_ID: string = '104857600000077';
const APP_SECRET: string = 'hosted-app-secret-reminders-1a2b';
const ZONE: string = 'America/Sao_Paulo';
const HOUR_MS: number = 3_600_000;
const ENV: Record<string, string> = {
    DEPLOYMENT_MODE: 'hosted',
    WHATSAPP_ACCESS_TOKEN: 'hosted-token-reminders-1a2b3c',
    WHATSAPP_PHONE_NUMBER_ID: PHONE_ID,
    WHATSAPP_VERIFY_TOKEN: 'hosted-verify-reminders-1a2b',
    WHATSAPP_APP_SECRET: APP_SECRET,
    WHATSAPP_WABA_ID: '200000000000077',
    WHATSAPP_DISPLAY_NUMBER: '+55 11 4000-0000',
    LLM_REPEAT_LIMIT: '1000',
    WHATSAPP_PRICE_TABLE: JSON.stringify({
        utility: { currency: 'BRL', amount: '0.30', date: '2026-01-01', source: 'tabela de teste' }
    }),
    REMINDERS_MAX_ACTIVE: '3',
    REMINDERS_MAX_TEMPLATE_SENDS_MONTH: '2'
};

function nowSeconds(): string {
    return String(Math.floor(Date.now() / 1000));
}

function bodyOf(from: string, wamid: string, message: Record<string, unknown>): string {
    return JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [
            {
                id: 'entry-1',
                changes: [
                    {
                        field: 'messages',
                        value: {
                            messaging_product: 'whatsapp',
                            metadata: { phone_number_id: PHONE_ID },
                            messages: [{ from, id: wamid, timestamp: nowSeconds(), ...message }]
                        }
                    }
                ]
            }
        ]
    });
}

describe('lembretes pelo WhatsApp (drivers mock)', () => {
    const publisher: CapturingPublisher = new CapturingPublisher();
    const signer: SignatureVerifier = new SignatureVerifier();
    let harness: AllocationHarness;
    let outbox: MockOutbox;
    let llm: MockLlmDriver;
    let engine: ReminderEngineService;
    let links: LinkContactService;
    let cursor: number = 0;
    let counter: number = 0;
    let phoneCounter: number = 0;

    function envelopeOf(message: PublishedMessage, companyId: string | null): QueueEnvelope {
        return {
            type: message.type,
            requestId: 'int-test',
            companyId,
            occurredAt: new Date().toISOString(),
            trace: {},
            payload: message.payload
        };
    }

    async function companyOf(table: string, id: string): Promise<string> {
        const rows = await harness.pg.query<{ companyId: string }>(`SELECT "companyId" FROM "${table}" WHERE "id" = $1`, [id]);
        return rows.rows[0]?.companyId ?? '';
    }

    async function inWorker<T>(fn: () => Promise<T>): Promise<T> {
        return harness.inCompany('00000000-0000-7000-8000-000000000000', fn);
    }

    async function run(message: PublishedMessage): Promise<void> {
        const payload = message.payload as { linkId?: string; messageId?: string };
        if (message.type === 'whatsapp.webhook.received') {
            await inWorker(async () => harness.app.get(WebhookReceivedHandler, { strict: false }).handle(envelopeOf(message, null)));
        }
        if (message.type === 'whatsapp.inbound.received') {
            await inWorker(async () => harness.app.get(InboundMessageHandler, { strict: false }).handle(envelopeOf(message, null)));
        }
        if (message.type === 'whatsapp.send.requested') {
            const companyId: string = await companyOf('WhatsAppMessages', payload.messageId ?? '');
            await harness.inCompany(companyId, async () =>
                harness.app.get(MessageSendHandler, { strict: false }).handle(envelopeOf(message, companyId))
            );
        }
        if (payload.linkId !== undefined) {
            const companyId: string = await companyOf('WhatsAppLinks', payload.linkId);
            await runChat(message, companyId);
        }
    }

    async function runChat(message: PublishedMessage, companyId: string): Promise<void> {
        const envelope: QueueEnvelope = envelopeOf(message, companyId);
        if (message.type === 'whatsapp.turn.requested') {
            await harness.inCompany(companyId, async () => harness.app.get(TurnRequestedHandler, { strict: false }).handle(envelope));
        }
        if (message.type === 'whatsapp.turn.answered') {
            await harness.inCompany(companyId, async () => harness.app.get(TurnAnsweredHandler, { strict: false }).handle(envelope));
        }
    }

    async function drain(): Promise<void> {
        while (cursor < publisher.published.length) {
            const message: PublishedMessage = publisher.published[cursor] as PublishedMessage;
            cursor += 1;
            await run(message);
        }
    }

    async function post(raw: string): Promise<void> {
        const response = await harness.callText(
            'POST',
            '/whatsapp/webhook',
            { ...HEADERS, 'x-hub-signature-256': signer.sign(raw, APP_SECRET) },
            raw
        );
        expect(response.status).toBe(200);
        await drain();
    }

    async function say(from: string, text: string): Promise<void> {
        counter += 1;
        await post(bodyOf(from, `wamid.rem.${String(counter)}`, { type: 'text', text: { body: text } }));
    }

    async function tap(from: string, id: string): Promise<void> {
        counter += 1;
        await post(
            bodyOf(from, `wamid.rem.${String(counter)}`, {
                type: 'interactive',
                interactive: { type: 'button_reply', button_reply: { id, title: 'x' } }
            })
        );
    }

    function bodiesTo(phone: string): (string | null)[] {
        return outbox
            .list()
            .filter((entry: MockSentMessage): boolean => entry.to === phone)
            .map((entry: MockSentMessage) => entry.body);
    }

    async function choicesTo(phone: string): Promise<string[]> {
        const rows = await harness.pg.query<{ payload: { choices: { id: string }[] } }>(
            'SELECT "payload" FROM "WhatsAppMessages" WHERE "peer" = $1 AND "kind" = \'interactive\' ORDER BY "createdAt" DESC LIMIT 1',
            [phone]
        );
        return (rows.rows[0]?.payload.choices ?? []).map((choice: { id: string }): string => choice.id);
    }

    async function premium(account: Account): Promise<Account> {
        const contracts: PlanContractService = harness.app.get(PlanContractService, { strict: false });
        await harness.inCompany(account.company.id, async () => {
            await contracts.open('premium', { startsAt: new Date(), subscriptionId: crypto.randomUUID() });
        });
        return account;
    }

    async function linked(label: string): Promise<{ account: Account; phone: string }> {
        phoneCounter += 1;
        const phone: string = `55119998${String(phoneCounter).padStart(5, '0')}`;
        const account: Account = await premium(await harness.signUp(label));
        const issued = await harness.call<IssuedBody>(account.token, 'POST', '/whatsapp/link/code', { consent: true });
        await say(phone, `VINCULAR ${issued.body.code}`);
        return { account, phone };
    }

    async function asPerson<T>(account: Account, fn: () => Promise<T>): Promise<T> {
        return harness.app
            .get(AppContext)
            .run({ requestId: 'int-person', companyId: account.company.id, userId: account.user.id, locale: 'pt-BR' }, fn);
    }

    async function schedule(account: Account, text: string, offsetMs: number = 2 * HOUR_MS): Promise<ReminderRow> {
        const reminder = await asPerson(account, async () =>
            engine.create({
                userId: account.user.id,
                linkId: (await links.liveLinkIdOfUser(account.user.id)) as string,
                text,
                kind: 'once',
                onceAt: new Date(Date.now() + offsetMs),
                dayOfMonth: null,
                timeOfDay: '09:00',
                timezone: ZONE
            })
        );
        return (await remindersOf(account)).find((row: ReminderRow): boolean => row.id === reminder.id) as ReminderRow;
    }

    async function remindersOf(account: Account): Promise<ReminderRow[]> {
        const rows = await harness.pg.query<ReminderRow>(
            'SELECT "id","text","kind","status","canceledReason","dayOfMonth","timeOfDay" FROM "Reminders" WHERE "companyId" = $1 ORDER BY "createdAt"',
            [account.company.id]
        );
        return rows.rows;
    }

    async function occurrencesOf(reminderId: string): Promise<OccurrenceRow[]> {
        const rows = await harness.pg.query<OccurrenceRow>(
            'SELECT "id","occurrenceAt","kind","status","channel","messageId" FROM "ReminderOccurrences" WHERE "reminderId" = $1 ORDER BY "createdAt","occurrenceAt"',
            [reminderId]
        );
        return rows.rows;
    }

    async function fire(account: Account, occurrenceId: string): Promise<void> {
        const message: PublishedMessage = { queue: 'vera-reminders', type: 'reminders.fire.requested', payload: { occurrenceId } };
        await harness.inCompany(account.company.id, async () =>
            harness.app.get(ReminderFireHandler, { strict: false }).handle(envelopeOf(message, account.company.id))
        );
        await drain();
    }

    async function closeWindow(phone: string): Promise<void> {
        await harness.pg.query(
            'UPDATE "WhatsAppMessages" SET "sentAt" = now() - interval \'25 hours\' WHERE "peer" = $1 AND "direction" = \'in\'',
            [phone]
        );
    }

    async function usageEntries(account: Account): Promise<{ task: string; detail: { category?: string } }[]> {
        const rows = await harness.pg.query<{ task: string; detail: { category?: string } }>(
            'SELECT "task","detail" FROM "PaidUsageEntries" WHERE "companyId" = $1 AND "task" = \'reminder\'',
            [account.company.id]
        );
        return rows.rows;
    }

    async function messagesOfKind(
        phone: string,
        kind: string
    ): Promise<{ id: string; status: string; payload: unknown; errorCode: string | null }[]> {
        const rows = await harness.pg.query<{ id: string; status: string; payload: unknown; errorCode: string | null }>(
            'SELECT "id","status","payload","errorCode" FROM "WhatsAppMessages" WHERE "peer" = $1 AND "direction" = \'out\' AND "kind" = $2 ORDER BY "createdAt"',
            [phone, kind]
        );
        return rows.rows;
    }

    beforeAll(async () => {
        Object.assign(process.env, ENV);
        harness = await AllocationHarness.start('reminders', publisher);
        outbox = harness.app.get(MockOutbox, { strict: false });
        llm = harness.app.get(MockLlmDriver, { strict: false });
        engine = harness.app.get(ReminderEngineService, { strict: false });
        links = harness.app.get(LinkContactService, { strict: false });
        const maintenance: ChannelMaintenanceApplication = harness.app.get(ChannelMaintenanceApplication, { strict: false });
        await inWorker(async () => maintenance.syncTemplates());
        await inWorker(async () => maintenance.syncTemplates());
    });

    afterAll(async () => {
        for (const key of Object.keys(ENV)) {
            Reflect.deleteProperty(process.env, key);
        }
        await harness.stop();
    });

    it('cria pela conversa: o modelo propõe, a pessoa confirma e sai um job atrasado com id determinístico', async () => {
        const { account, phone } = await linked('rem-create');
        llm.enqueue({
            text: '',
            toolUses: [
                { toolUseId: 'r1', name: 'reminder_create', input: { text: 'fazer o aporte do mês', kind: 'monthly', dayOfMonth: 5 } }
            ]
        });
        llm.enqueue('Posso criar, falta a sua confirmação.');

        await say(phone, 'me lembra de aportar todo dia 5');
        const yes: string = (await choicesTo(phone))[0] ?? '';
        expect(yes).toMatch(/^act:yes:/);
        expect(await remindersOf(account)).toEqual([]);
        await tap(phone, yes);

        const reminders: ReminderRow[] = await remindersOf(account);
        expect(reminders).toEqual([
            expect.objectContaining({ text: 'fazer o aporte do mês', kind: 'monthly', status: 'active', dayOfMonth: 5, timeOfDay: '09:00' })
        ]);
        expect(bodiesTo(phone).at(-1)).toBe(
            'Lembrete criado: fazer o aporte do mês, todo dia 5 às 09:00. Para ver ou apagar, mande "meus lembretes".'
        );
        const occurrence: OccurrenceRow = (await occurrencesOf((reminders[0] as ReminderRow).id))[0] as OccurrenceRow;
        const job: PublishedMessage | undefined = publisher.ofType('reminders.fire.requested').at(-1);
        expect(occurrence).toMatchObject({ status: 'scheduled', kind: 'regular' });
        expect(job?.options).toMatchObject({
            jobId: `reminder-${(reminders[0] as ReminderRow).id}-${String(occurrence.occurrenceAt.getTime())}`
        });
        expect(job?.options?.delayMs).toBeGreaterThan(0);
        expect(job?.payload).toEqual({ occurrenceId: occurrence.id });
    });

    it('lista e apaga pela conversa com o comando fixo, e o job é removido pelo mesmo id', async () => {
        const { account, phone } = await linked('rem-commands');
        await say(phone, 'meus lembretes');
        expect(bodiesTo(phone).at(-1)).toBe('Você não tem lembretes. É só pedir: "me lembra de aportar todo dia 5".');
        const first: ReminderRow = await schedule(account, 'pagar a fatura');
        await schedule(account, 'renovar o seguro');
        const occurrence: OccurrenceRow = (await occurrencesOf(first.id))[0] as OccurrenceRow;

        await say(phone, 'meus lembretes');
        expect(bodiesTo(phone).at(-1)).toMatch(
            /^Seus lembretes:\n1\. pagar a fatura, hoje às \d{2}:\d{2}\n2\. renovar o seguro, hoje às \d{2}:\d{2}$/
        );
        await say(phone, 'apagar lembrete 1');

        expect(bodiesTo(phone).at(-1)).toBe('Lembrete apagado: pagar a fatura.');
        expect((await remindersOf(account)).map((row: ReminderRow) => [row.text, row.status, row.canceledReason])).toEqual([
            ['pagar a fatura', 'canceled', 'user'],
            ['renovar o seguro', 'active', null]
        ]);
        expect((await occurrencesOf(first.id))[0]?.status).toBe('canceled');
        expect(publisher.removed).toContainEqual({
            queue: 'vera-reminders',
            jobId: `reminder-${first.id}-${String(occurrence.occurrenceAt.getTime())}`
        });
        await say(phone, 'apagar lembrete 9');
        expect(bodiesTo(phone).at(-1)).toBe('Não achei o lembrete 9. Mande "meus lembretes" para ver a lista.');
    });

    it('dispara com a janela aberta: texto grátis com três botões, nada lançado, e a mensal agenda a próxima', async () => {
        const { account, phone } = await linked('rem-text');
        const reminder = await asPerson(account, async () =>
            engine.create({
                userId: account.user.id,
                linkId: (await links.liveLinkIdOfUser(account.user.id)) as string,
                text: 'fazer o aporte do mês',
                kind: 'monthly',
                onceAt: null,
                dayOfMonth: 5,
                timeOfDay: '09:00',
                timezone: ZONE
            })
        );
        const first: OccurrenceRow = (await occurrencesOf(reminder.id))[0] as OccurrenceRow;
        const jobsBefore: number = publisher.ofType('reminders.fire.requested').length;

        await fire(account, first.id);

        expect(bodiesTo(phone).at(-1)).toBe('Lembrete: fazer o aporte do mês.');
        expect(await choicesTo(phone)).toEqual([`rem:done:${reminder.id}`, `rem:snooze1h:${reminder.id}`, `rem:tomorrow:${reminder.id}`]);
        const occurrences: OccurrenceRow[] = await occurrencesOf(reminder.id);
        expect(occurrences.map((row: OccurrenceRow) => [row.kind, row.status, row.channel])).toEqual([
            ['regular', 'sent', 'text'],
            ['regular', 'scheduled', null]
        ]);
        expect((occurrences[1] as OccurrenceRow).occurrenceAt.getTime()).toBeGreaterThan(first.occurrenceAt.getTime());
        expect(publisher.ofType('reminders.fire.requested')).toHaveLength(jobsBefore + 1);
        expect(await usageEntries(account)).toEqual([]);
        expect((await remindersOf(account))[0]?.status).toBe('active');
    });

    it('dispara com a janela fechada: confere a cota, manda o template com os botões e lança uma linha no razão', async () => {
        const { account, phone } = await linked('rem-template');
        const reminder: ReminderRow = await schedule(account, 'pagar a fatura');
        await closeWindow(phone);
        const occurrence: OccurrenceRow = (await occurrencesOf(reminder.id))[0] as OccurrenceRow;

        await fire(account, occurrence.id);

        const templates = await messagesOfKind(phone, 'template');
        expect(templates).toHaveLength(1);
        expect(templates[0]).toMatchObject({
            status: 'sent',
            payload: {
                template: {
                    language: 'pt_BR',
                    variables: ['pagar a fatura'],
                    buttonPayloads: [`rem:done:${reminder.id}`, `rem:snooze1h:${reminder.id}`, `rem:tomorrow:${reminder.id}`]
                }
            }
        });
        expect((await occurrencesOf(reminder.id))[0]).toMatchObject({ status: 'sent', channel: 'template' });
        expect(await usageEntries(account)).toEqual([expect.objectContaining({ task: 'reminder', detail: { category: 'utility' } })]);
        expect((await remindersOf(account))[0]?.status).toBe('done');
    });

    it('"Feito", "Adiar 1h" e "Amanhã" tratam a ocorrência sem mexer na recorrência', async () => {
        const { account, phone } = await linked('rem-buttons');
        const done: ReminderRow = await schedule(account, 'pagar a fatura');
        const snooze: ReminderRow = await schedule(account, 'renovar o seguro');
        const tomorrow: ReminderRow = await schedule(account, 'ligar para o contador');
        for (const reminder of [done, snooze, tomorrow]) {
            await fire(account, ((await occurrencesOf(reminder.id))[0] as OccurrenceRow).id);
        }

        await tap(phone, `rem:done:${done.id}`);
        expect(bodiesTo(phone).at(-1)).toBe('Anotado, lembrete concluído.');
        await tap(phone, `rem:snooze1h:${snooze.id}`);
        expect(bodiesTo(phone).at(-1)).toBe('Combinado, lembro de novo em 1 hora.');
        await tap(phone, `rem:tomorrow:${tomorrow.id}`);
        expect(bodiesTo(phone).at(-1)).toBe('Combinado, lembro amanhã às 09:00.');
        await tap(phone, `rem:snooze1h:${snooze.id}`);
        expect(bodiesTo(phone).at(-1)).toBe('Esse lembrete já foi tratado.');

        expect((await occurrencesOf(done.id)).map((row: OccurrenceRow) => row.status)).toEqual(['done']);
        const snoozed: OccurrenceRow[] = await occurrencesOf(snooze.id);
        expect(snoozed.map((row: OccurrenceRow) => [row.kind, row.status])).toEqual([
            ['regular', 'done'],
            ['snooze', 'scheduled']
        ]);
        const delay: number = (snoozed[1] as OccurrenceRow).occurrenceAt.getTime() - Date.now();
        expect(delay).toBeGreaterThan(HOUR_MS - 60_000);
        expect(delay).toBeLessThanOrEqual(HOUR_MS);
        const tomorrows: OccurrenceRow[] = await occurrencesOf(tomorrow.id);
        const next: Date = (tomorrows[1] as OccurrenceRow).occurrenceAt;
        expect(tomorrows[1]).toMatchObject({ kind: 'snooze', status: 'scheduled' });
        expect(new Intl.DateTimeFormat('pt-BR', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' }).format(next)).toBe('09:00');
        expect(next.getTime()).toBeGreaterThan(Date.now());
        expect(next.getTime() - Date.now()).toBeLessThanOrEqual(48 * HOUR_MS);
        expect((await remindersOf(account)).map((row: ReminderRow) => row.status)).toEqual(['done', 'done', 'done']);
    });

    it('job duplicado e varredura ao mesmo tempo mandam uma mensagem só', async () => {
        const { account, phone } = await linked('rem-once');
        const reminder: ReminderRow = await schedule(account, 'pagar a fatura');
        const occurrence: OccurrenceRow = (await occurrencesOf(reminder.id))[0] as OccurrenceRow;
        const before: number = (await messagesOfKind(phone, 'interactive')).length;

        await Promise.all([fire(account, occurrence.id), fire(account, occurrence.id), fire(account, occurrence.id)]);

        expect(await messagesOfKind(phone, 'interactive')).toHaveLength(before + 1);
        expect((await occurrencesOf(reminder.id))[0]?.status).toBe('sent');
    });

    it('sem vínculo ativo a ocorrência fica unreached e o lembrete não some em silêncio', async () => {
        const { account } = await linked('rem-nolink');
        const reminder: ReminderRow = await schedule(account, 'pagar a fatura');
        await harness.pg.query('UPDATE "Reminders" SET "linkId" = NULL WHERE "id" = $1', [reminder.id]);

        await fire(account, ((await occurrencesOf(reminder.id))[0] as OccurrenceRow).id);

        expect((await occurrencesOf(reminder.id))[0]?.status).toBe('unreached');
    });

    it('cota pausada com a janela fechada: a ocorrência vira missed e nada sai', async () => {
        const { account, phone } = await linked('rem-paused');
        await closeWindow(phone);
        const reminder: ReminderRow = await schedule(account, 'pagar a fatura');
        const before: number = bodiesTo(phone).length;
        const state = vi.spyOn(harness.app.get(PlanGateService, { strict: false }), 'stateOf').mockResolvedValueOnce('paused');

        await fire(account, ((await occurrencesOf(reminder.id))[0] as OccurrenceRow).id);

        state.mockRestore();
        expect((await occurrencesOf(reminder.id))[0]?.status).toBe('missed');
        expect(bodiesTo(phone)).toHaveLength(before);
    });

    it('cota pausada com a janela aberta: o lembrete sai como texto, que não custa', async () => {
        const { account, phone } = await linked('rem-paused-open');
        const reminder: ReminderRow = await schedule(account, 'pagar a fatura');
        const templates: number = (await messagesOfKind(phone, 'template')).length;
        const state = vi.spyOn(harness.app.get(PlanGateService, { strict: false }), 'stateOf').mockResolvedValueOnce('paused');

        await fire(account, ((await occurrencesOf(reminder.id))[0] as OccurrenceRow).id);

        state.mockRestore();
        expect((await occurrencesOf(reminder.id))[0]?.status).toBe('sent');
        expect(await messagesOfKind(phone, 'template')).toHaveLength(templates);
    });

    it('janela fechada sem cota para o template: missed, e o limite de disparos por template do mês também vira missed', async () => {
        const { account, phone } = await linked('rem-cap');
        await closeWindow(phone);
        const capped: ReminderRow = await schedule(account, 'pagar a fatura');
        const meter = vi
            .spyOn(harness.app.get(PaidUsageMeter, { strict: false }), 'assertRoom')
            .mockRejectedValueOnce(new CapReachedError('whatsapp', null));
        await fire(account, ((await occurrencesOf(capped.id))[0] as OccurrenceRow).id);
        meter.mockRestore();
        expect((await occurrencesOf(capped.id))[0]?.status).toBe('missed');
        expect(await messagesOfKind(phone, 'template')).toHaveLength(0);

        const sends: ReminderRow[] = [await schedule(account, 'um'), await schedule(account, 'dois')];
        for (const reminder of sends) {
            await fire(account, ((await occurrencesOf(reminder.id))[0] as OccurrenceRow).id);
        }
        const over: ReminderRow = await schedule(account, 'três');
        await fire(account, ((await occurrencesOf(over.id))[0] as OccurrenceRow).id);

        expect(await messagesOfKind(phone, 'template')).toHaveLength(2);
        expect((await occurrencesOf(over.id))[0]?.status).toBe('missed');
    });

    it('texto recusado depois do envio (janela fechou no meio): cai para o template; template que falha vira unreached', async () => {
        const { account, phone } = await linked('rem-fallback');
        const reminder: ReminderRow = await schedule(account, 'pagar a fatura');
        const occurrence: OccurrenceRow = (await occurrencesOf(reminder.id))[0] as OccurrenceRow;
        const held: number = cursor;
        const message: PublishedMessage = {
            queue: 'vera-reminders',
            type: 'reminders.fire.requested',
            payload: { occurrenceId: occurrence.id }
        };
        await harness.inCompany(account.company.id, async () =>
            harness.app.get(ReminderFireHandler, { strict: false }).handle(envelopeOf(message, account.company.id))
        );
        expect((await occurrencesOf(reminder.id))[0]).toMatchObject({ status: 'sent', channel: 'text' });
        expect(cursor).toBe(held);

        await closeWindow(phone);
        await drain();

        const after: OccurrenceRow = (await occurrencesOf(reminder.id))[0] as OccurrenceRow;
        expect(after).toMatchObject({ status: 'sent', channel: 'template' });
        expect((await messagesOfKind(phone, 'interactive')).at(-1)).toMatchObject({ status: 'failed', errorCode: 'window_closed' });
        expect(await messagesOfKind(phone, 'template')).toHaveLength(1);

        await harness.pg.query('UPDATE "WhatsAppMessages" SET "status" = \'queued\' WHERE "id" = $1', [after.messageId]);
        await harness.inCompany(account.company.id, async () =>
            harness.app.get(ReminderFireApplication, { strict: false }).onOutboundFailed(after.messageId as string)
        );
        expect((await occurrencesOf(reminder.id))[0]?.status).toBe('unreached');
    });

    it('Premium encerrado e desvincular cancelam os lembretes', async () => {
        const ended = await linked('rem-premium-ended');
        const endedReminder: ReminderRow = await schedule(ended.account, 'pagar a fatura');
        const registry: PremiumLifecycleRegistry = harness.app.get(PremiumLifecycleRegistry, { strict: false });
        await harness.inCompany(ended.account.company.id, async () => registry.handlerNamed('reminders')?.onPremiumEnded());

        expect((await remindersOf(ended.account)).find((row: ReminderRow) => row.id === endedReminder.id)).toMatchObject({
            status: 'canceled',
            canceledReason: 'premium_ended'
        });

        const unlinked = await linked('rem-unlink');
        const unlinkedReminder: ReminderRow = await schedule(unlinked.account, 'renovar o seguro');
        const response = await harness.call(unlinked.account.token, 'DELETE', '/whatsapp/link');

        expect(response.status).toBe(204);
        expect((await remindersOf(unlinked.account)).find((row: ReminderRow) => row.id === unlinkedReminder.id)).toMatchObject({
            status: 'canceled',
            canceledReason: 'unlinked'
        });
        expect((await occurrencesOf(unlinkedReminder.id))[0]?.status).toBe('canceled');
    });

    it('saída de membro cancela só os lembretes da pessoa', async () => {
        const { account } = await linked('rem-member');
        const mine: ReminderRow = await schedule(account, 'pagar a fatura');
        const member: RemindersMemberLifecycle = harness.app.get(RemindersMemberLifecycle, { strict: false });
        await harness.inCompany(account.company.id, async () => member.onMemberRemoved('00000000-0000-7000-8000-0000000000aa'));
        expect((await remindersOf(account)).find((row: ReminderRow) => row.id === mine.id)?.status).toBe('active');

        await harness.inCompany(account.company.id, async () => member.onMemberRemoved(account.user.id));
        expect((await remindersOf(account)).find((row: ReminderRow) => row.id === mine.id)).toMatchObject({
            status: 'canceled',
            canceledReason: 'member_removed'
        });
    });

    it('a varredura reenfileira a ocorrência perdida e marca missed a mais velha que 6 h, agendando a próxima mensal', async () => {
        const { account } = await linked('rem-sweep');
        const lost: ReminderRow = await schedule(account, 'pagar a fatura');
        const stale = await asPerson(account, async () =>
            engine.create({
                userId: account.user.id,
                linkId: (await links.liveLinkIdOfUser(account.user.id)) as string,
                text: 'aportar',
                kind: 'monthly',
                onceAt: null,
                dayOfMonth: 5,
                timeOfDay: '09:00',
                timezone: ZONE
            })
        );
        await harness.pg.query(
            'UPDATE "ReminderOccurrences" SET "occurrenceAt" = now() - interval \'10 minutes\' WHERE "reminderId" = $1',
            [lost.id]
        );
        await harness.pg.query('UPDATE "ReminderOccurrences" SET "occurrenceAt" = now() - interval \'7 hours\' WHERE "reminderId" = $1', [
            stale.id
        ]);
        const before: number = publisher.ofType('reminders.fire.requested').length;

        await inWorker(async () => harness.app.get(ReminderMaintenanceApplication, { strict: false }).sweep());

        const requeued: PublishedMessage[] = publisher.ofType('reminders.fire.requested').slice(before);
        const lostOccurrence: OccurrenceRow = (await occurrencesOf(lost.id))[0] as OccurrenceRow;
        expect(requeued.map((message: PublishedMessage) => message.payload)).toContainEqual({ occurrenceId: lostOccurrence.id });
        expect(
            requeued.find((message) => (message.payload as { occurrenceId: string }).occurrenceId === lostOccurrence.id)?.options
        ).toMatchObject({
            jobId: `reminder-${lost.id}-${String(lostOccurrence.occurrenceAt.getTime())}`,
            delayMs: 0
        });
        const staleOccurrences: OccurrenceRow[] = await occurrencesOf(stale.id);
        expect(staleOccurrences.map((row: OccurrenceRow) => row.status)).toEqual(['missed', 'scheduled']);
        expect((await remindersOf(account)).find((row: ReminderRow) => row.id === stale.id)?.status).toBe('active');
    });

    it('limite de lembretes ativos: a ferramenta recusa com o texto do tom e a criação confirmada também', async () => {
        const { account, phone } = await linked('rem-limit');
        for (const text of ['um', 'dois', 'três']) {
            await schedule(account, text);
        }
        llm.enqueue({
            text: '',
            toolUses: [{ toolUseId: 'r9', name: 'reminder_create', input: { text: 'quarto', kind: 'monthly', dayOfMonth: 10 } }]
        });
        llm.enqueue('Você já tem 3 lembretes. Apague algum em "meus lembretes".');

        await say(phone, 'me lembra do aluguel todo dia 10');

        expect(bodiesTo(phone).at(-1)).toBe('Você já tem 3 lembretes. Apague algum em "meus lembretes".');
        expect(await remindersOf(account)).toHaveLength(3);
        await expect(schedule(account, 'quarto')).rejects.toMatchObject({ code: 'reminders.limit_reached' });
    });

    it('GET e DELETE /reminders são só da própria pessoa, e duas companies ficam isoladas', async () => {
        const alice = await linked('rem-api-a');
        const bob = await linked('rem-api-b');
        const mine: ReminderRow = await schedule(alice.account, 'pagar a fatura');
        const theirs: ReminderRow = await schedule(bob.account, 'segredo do bob');
        const users: UserDomain = harness.app.get(UserDomain, { strict: false });
        const issuer: SessionIssuerPort = harness.app.get(SessionIssuerPort, { strict: false });
        const viewer: User = await harness.inCompany(alice.account.company.id, async () =>
            users.createMember({
                email: `viewer-${crypto.randomUUID()}@example.com`,
                name: 'Pessoa leitura',
                role: 'viewer',
                emailVerifiedAt: new Date(),
                termsAcceptedAt: new Date()
            })
        );
        const tokens: AuthTokens = await harness.inCompany(alice.account.company.id, async () =>
            issuer.issueForNewLogin(viewer, { ip: '203.0.113.9', userAgent: 'int-test' }, 'google', 'app')
        );

        const listed = await harness.call<ListBody>(alice.account.token, 'GET', '/reminders');
        expect(listed.status).toBe(200);
        expect(listed.body.items.map((item) => item.text)).toEqual(['pagar a fatura']);
        expect(listed.body.items[0]).toMatchObject({ kind: 'once', createdVia: 'whatsapp', dayOfMonth: null });
        expect(listed.body.items[0]?.nextAt).not.toBeNull();
        expect((await harness.call<ListBody>(tokens.accessToken, 'GET', '/reminders')).body.items).toEqual([]);
        expect((await harness.call(tokens.accessToken, 'DELETE', `/reminders/${mine.id}`)).status).toBe(404);
        expect((await harness.call(alice.account.token, 'DELETE', `/reminders/${theirs.id}`)).status).toBe(404);
        expect((await harness.call(alice.account.token, 'DELETE', '/reminders/not-a-uuid')).status).toBe(400);
        expect((await harness.call(null, 'GET', '/reminders')).status).toBe(401);

        expect((await harness.call(alice.account.token, 'DELETE', `/reminders/${mine.id}`)).status).toBe(204);
        expect((await harness.call<ListBody>(alice.account.token, 'GET', '/reminders')).body.items).toEqual([]);
        expect((await harness.call(alice.account.token, 'DELETE', `/reminders/${mine.id}`)).status).toBe(404);
        expect((await harness.call<ListBody>(bob.account.token, 'GET', '/reminders')).body.items.map((item) => item.text)).toEqual([
            'segredo do bob'
        ]);
    });

    it('"Exportar tudo" traz os lembretes da conta, e o apagador tira os jobs pendentes antes da exclusão', async () => {
        const { account } = await linked('rem-export');
        const exported: ReminderRow = await schedule(account, '=SOMA(1;1)');
        const occurrence: OccurrenceRow = (await occurrencesOf(exported.id))[0] as OccurrenceRow;
        const registry: AccountSpreadsheetRegistry = harness.app.get(AccountSpreadsheetRegistry, { strict: false });

        const sheets = await asPerson(account, async () => registry.sheets());

        const sheet = sheets.find((candidate) => candidate.file === 'lembretes');
        expect(sheet?.name).toBe('Lembretes');
        const rows: unknown[][] = [];
        for await (const row of sheet?.rows ?? []) {
            rows.push([...row]);
        }
        expect(rows).toHaveLength(1);
        expect(rows[0]?.slice(0, 3)).toEqual(["'=SOMA(1;1)", expect.stringContaining('hoje'), 'Ativo']);

        const erased: number = await inWorker(async () =>
            harness.app.get(RemindersAccountEraser, { strict: false }).eraseAll(account.company.id)
        );

        expect(erased).toBe(1);
        expect(publisher.removed).toContainEqual({
            queue: 'vera-reminders',
            jobId: `reminder-${exported.id}-${String(occurrence.occurrenceAt.getTime())}`
        });
    });
});
