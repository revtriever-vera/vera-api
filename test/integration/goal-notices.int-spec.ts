import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EnqueueMailRequest } from '../../src/core/mail/mailer.port';
import { AskVeraToolRegistry } from '../../src/modules/ai-assistant/services/ask-vera-tool.registry';
import { GoalNoticesApplication } from '../../src/modules/goal-notices/application/goal-notices.application';
import { addDays } from '../../src/modules/fixed-income/domain/curve/business-days';
import { GoalsReaderService } from '../../src/modules/goals/services/goals-reader.service';
import { AccountDataRegistry } from '../../src/modules/identity/services/account-data.registry';
import { DateUtil } from '../../src/shared/utils/date.util';
import { Account, AllocationHarness } from './support/allocation-harness';
import { CapturingPublisher, PublishedMessage } from './support/queue';

const TODAY: string = DateUtil.todayInBrazil();
const IN_THIRTY_DAYS: string = addDays(TODAY, 30);
const MAIL_MESSAGE: string = 'email.send.requested';

interface IdBody {
    readonly id: string;
}

describe('aviso de objetivo atrasado por e-mail', () => {
    let harness: AllocationHarness;
    let publisher: CapturingPublisher;

    beforeAll(async () => {
        publisher = new CapturingPublisher();
        harness = await AllocationHarness.start('goalnotices', publisher);
    });

    afterAll(async () => {
        await harness.stop();
    });

    beforeEach(() => {
        publisher.published.length = 0;
        publisher.removed.length = 0;
    });

    async function createBehind(account: Account, name: string, targetDate: string = IN_THIRTY_DAYS): Promise<string> {
        const created = await harness.call<IdBody>(account.token, 'POST', '/goals', {
            kind: 'travel',
            name,
            targetMinor: 1_200_000,
            targetDate,
            holdings: []
        });
        expect(created.status).toBe(201);
        await harness.pg.query(
            `UPDATE "Goals" SET "planStartMonth" = date_trunc('month', now() - interval '6 months'), "planStartMinor" = 0, "planMonths" = 12 WHERE id = $1`,
            [created.body.id]
        );
        return created.body.id;
    }

    async function evaluate(account: Account): Promise<number> {
        const application: GoalNoticesApplication = harness.app.get(GoalNoticesApplication, { strict: false });
        return harness.inCompany(account.company.id, async () => application.evaluate(account.company.id));
    }

    function mails(): EnqueueMailRequest[] {
        return publisher.ofType(MAIL_MESSAGE).map((message: PublishedMessage): EnqueueMailRequest => message.payload as EnqueueMailRequest);
    }

    async function marksOf(account: Account): Promise<number> {
        const result = await harness.pg.query<{ total: string }>(
            `SELECT count(*) AS total FROM "GoalNoticeMarks" WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
            [account.company.id]
        );
        return Number(result.rows[0]?.total ?? 0);
    }

    it('avisa a pessoa do objetivo atrasado a 30 dias da data, com o descadastro, e não repete no mês', async () => {
        const owner: Account = await harness.signUp('behind');
        await createBehind(owner, 'Viagem');

        const first: number = await evaluate(owner);
        const sent: EnqueueMailRequest[] = mails();
        await harness.pg.query(`DELETE FROM "NoticeSends" WHERE "companyId" = $1`, [owner.company.id]);
        const second: number = await evaluate(owner);

        expect(first).toBe(1);
        expect(sent).toHaveLength(1);
        expect(sent[0]?.template).toBe('goal-behind');
        expect(sent[0]?.to.email).toBe(owner.user.email);
        expect(sent[0]?.unsubscribeUrl).toContain('/notifications/unsubscribe/');
        expect(sent[0]?.props['goals']).toContain('Viagem');
        expect(second).toBe(0);
        expect(mails()).toHaveLength(1);
        expect(await marksOf(owner)).toBe(1);
    });

    it('com dois objetivos atrasados no mesmo dia sai um e-mail só, com os dois', async () => {
        const owner: Account = await harness.signUp('two');
        await createBehind(owner, 'Viagem');
        await createBehind(owner, 'Reforma');

        const total: number = await evaluate(owner);

        expect(total).toBe(2);
        expect(mails()).toHaveLength(1);
        expect(JSON.parse(mails()[0]?.props['goals'] ?? '[]')).toHaveLength(2);
        expect(await marksOf(owner)).toBe(2);
    });

    it('quem desligou o aviso não recebe, e o objetivo em dia ou fora do dia não gera e-mail', async () => {
        const muted: Account = await harness.signUp('muted');
        await createBehind(muted, 'Viagem');
        await harness.call(muted.token, 'PATCH', '/notifications/preferences', { type: 'goal_behind', enabled: false });
        const onTrack: Account = await harness.signUp('ontrack');
        const created = await harness.call<IdBody>(onTrack.token, 'POST', '/goals', {
            kind: 'travel',
            name: 'Em dia',
            targetMinor: 1_200_000,
            targetDate: IN_THIRTY_DAYS,
            holdings: []
        });
        expect(created.status).toBe(201);
        const farAway: Account = await harness.signUp('far');
        await createBehind(farAway, 'Longe', addDays(TODAY, 400));

        await evaluate(muted);
        await evaluate(onTrack);
        await evaluate(farAway);

        expect(mails()).toHaveLength(0);
    });

    it('a varredura diária só pede avaliação das empresas com objetivo vencendo, uma por dia', async () => {
        const due: Account = await harness.signUp('due');
        await createBehind(due, 'Viagem');
        const empty: Account = await harness.signUp('empty');
        const application: GoalNoticesApplication = harness.app.get(GoalNoticesApplication, { strict: false });
        const reader: GoalsReaderService = harness.app.get(GoalsReaderService, { strict: false });

        await application.fanOutDaily();
        const ids: string[] = await reader.companyIdsDue(TODAY);
        const requests: PublishedMessage[] = publisher.ofType('goal-notices.evaluate.requested');

        expect(ids).toContain(due.company.id);
        expect(ids).not.toContain(empty.company.id);
        const jobIds: (string | undefined)[] = requests.map((message: PublishedMessage) => message.options?.jobId);
        expect(jobIds).toContain(`goal-notices-${due.company.id}-${TODAY}`);
        expect(jobIds).not.toContain(`goal-notices-${empty.company.id}-${TODAY}`);
        expect(jobIds.every((jobId: string | undefined): boolean => !(jobId ?? '').includes(':'))).toBe(true);
    });

    it('a exclusão de conta cancela os jobs de avaliação pendentes', async () => {
        const owner: Account = await harness.signUp('erase');
        const registry: AccountDataRegistry = harness.app.get(AccountDataRegistry, { strict: false });

        await harness.inCompany(owner.company.id, async () => registry.eraseAll(owner.company.id));

        expect(publisher.removed.map((item) => item.jobId)).toContain(`goal-notices-${owner.company.id}-${TODAY}`);
    });

    it('a ferramenta goals_overview é descoberta, só responde na conversa e mostra só nome, saldo e situação', async () => {
        const owner: Account = await harness.signUp('tool');
        await createBehind(owner, 'Viagem');
        const registry: AskVeraToolRegistry = harness.app.get(AskVeraToolRegistry, { strict: false });
        const tool = registry.all().find((candidate) => candidate.name === 'goals_overview');

        const output = await harness.inCompany(owner.company.id, async () => tool?.run({}));

        expect(tool?.kind).toBe('direct');
        expect(output?.text).toContain('- Viagem: R$ 0 / R$ 12.000 (0%). Atrasado.');
        expect(publisher.ofType(MAIL_MESSAGE)).toHaveLength(0);
    });
});
