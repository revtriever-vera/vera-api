import { describe, expect, it, vi } from 'vitest';
import { DatabaseClient } from '../../../core/database/database.client';
import { TransactionalContext } from '../../../core/database/using-transaction.decorator';
import { TooManyAttemptsError, ThrottleService } from '../../../core/throttle/throttle.service';
import { AccountDeletionLogDomain } from '../domain/account-deletion-log.domain';
import { CompanyDomain } from '../domain/company.domain';
import { AccountClosedError, AccountErasureFailedError, ConfirmationMismatchError, ForbiddenError } from '../domain/identity.errors';
import { Company, User } from '../domain/identity.types';
import { AccountDataRegistry } from '../services/account-data.registry';
import { CurrentUserService } from '../services/current-user.service';
import { IdentityLogService } from '../services/identity-log.service';
import { IdentityMetricsService } from '../services/identity-metrics.service';
import { AccountDeletionApplication } from './account-deletion.application';

const AT: Date = new Date('2026-01-01T00:00:00.000Z');

const USER: User = {
    id: 'user-1',
    companyId: 'company-1',
    email: 'Pessoa.Teste@Example.test',
    name: 'Pessoa Teste',
    role: 'owner',
    locale: null,
    emailVerifiedAt: AT,
    termsAcceptedAt: AT,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null
};

const COMPANY: Company = {
    id: 'company-1',
    name: 'Empresa Teste',
    locale: 'en',
    timezone: 'America/Sao_Paulo',
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null
};

interface Options {
    readonly user?: User;
    readonly company?: Company | null;
    readonly eraseAll?: () => Promise<{ area: string; erased: number }[]>;
    readonly eraseCompany?: boolean;
    readonly throttle?: Error;
}

interface Doubles {
    readonly application: AccountDeletionApplication;
    readonly order: string[];
    readonly enqueue: ReturnType<typeof vi.fn>;
    readonly record: ReturnType<typeof vi.fn>;
    readonly accountDeletion: ReturnType<typeof vi.fn>;
}

function build(options: Options = {}): Doubles {
    const order: string[] = [];
    TransactionalContext.set({ withTransaction: async (fn: () => Promise<unknown>) => fn() } as unknown as DatabaseClient);
    const record: ReturnType<typeof vi.fn> = vi.fn().mockImplementation(() => {
        order.push('log');
        return Promise.resolve({ companyHash: 'hash-1' });
    });
    const enqueue: ReturnType<typeof vi.fn> = vi.fn().mockImplementation(() => {
        order.push('mail');
        return Promise.resolve();
    });
    const accountDeletion: ReturnType<typeof vi.fn> = vi.fn();
    const application: AccountDeletionApplication = new AccountDeletionApplication(
        {
            assertAllowed: vi.fn().mockImplementation(() => (options.throttle ? Promise.reject(options.throttle) : Promise.resolve()))
        } as unknown as ThrottleService,
        { require: vi.fn().mockResolvedValue(options.user ?? USER) } as unknown as CurrentUserService,
        {
            findById: vi.fn().mockResolvedValue(options.company === undefined ? COMPANY : options.company),
            eraseCompany: vi.fn().mockImplementation(() => {
                order.push('delete');
                return Promise.resolve(options.eraseCompany ?? true);
            })
        } as unknown as CompanyDomain,
        { record } as unknown as AccountDeletionLogDomain,
        {
            eraseAll: vi.fn().mockImplementation(async () => {
                order.push('erasers');
                return (options.eraseAll ?? (() => Promise.resolve([{ area: 'assets', erased: 2 }])))();
            })
        } as unknown as AccountDataRegistry,
        { enqueue },
        { deletionStarted: vi.fn(), accountDeleted: vi.fn() } as unknown as IdentityLogService,
        { accountDeletion } as unknown as IdentityMetricsService
    );
    return { application, order, enqueue, record, accountDeletion };
}

describe('AccountDeletionApplication', () => {
    it('apaga na ordem apagadores, trilha, company e e-mail, e-mail capturado antes do delete', async () => {
        const doubles: Doubles = build();

        await doubles.application.delete('pessoa.teste@example.test');

        expect(doubles.order).toEqual(['erasers', 'log', 'delete', 'mail']);
        expect(doubles.record).toHaveBeenCalledWith({
            companyId: 'company-1',
            requestedAt: expect.any(Date),
            completedAt: expect.any(Date),
            areas: [{ area: 'assets', erased: 2 }]
        });
        expect(doubles.enqueue).toHaveBeenCalledWith({
            template: 'account-deleted',
            locale: 'en',
            props: { firstName: 'Pessoa' },
            to: { email: 'Pessoa.Teste@Example.test', name: 'Pessoa' },
            reference: 'hash-1'
        });
        expect(doubles.accountDeletion).toHaveBeenCalledWith('success');
    });

    it('ignora maiúsculas e espaços ao comparar o e-mail digitado', async () => {
        const doubles: Doubles = build();

        await expect(doubles.application.delete('  PESSOA.TESTE@EXAMPLE.TEST ')).resolves.toBeUndefined();
    });

    it('e-mail diferente responde 422 sem efeito algum', async () => {
        const doubles: Doubles = build();

        await expect(doubles.application.delete('outra@example.test')).rejects.toBeInstanceOf(ConfirmationMismatchError);

        expect(doubles.order).toEqual([]);
        expect(doubles.accountDeletion).toHaveBeenCalledWith('mismatch');
    });

    it('member responde 403 sem efeito algum', async () => {
        const doubles: Doubles = build({ user: { ...USER, role: 'member' } });

        await expect(doubles.application.delete('pessoa.teste@example.test')).rejects.toBeInstanceOf(ForbiddenError);

        expect(doubles.order).toEqual([]);
    });

    it('limite estourado responde 429 sem efeito algum', async () => {
        const doubles: Doubles = build({ throttle: new TooManyAttemptsError() });

        await expect(doubles.application.delete('pessoa.teste@example.test')).rejects.toBeInstanceOf(TooManyAttemptsError);

        expect(doubles.order).toEqual([]);
    });

    it('apagador que lança interrompe antes de gravar a trilha e de apagar a company', async () => {
        const doubles: Doubles = build({
            eraseAll: async () => Promise.reject(new AccountErasureFailedError('assets', new Error('boom')))
        });

        await expect(doubles.application.delete('pessoa.teste@example.test')).rejects.toBeInstanceOf(AccountErasureFailedError);

        expect(doubles.order).toEqual(['erasers']);
        expect(doubles.enqueue).not.toHaveBeenCalled();
        expect(doubles.accountDeletion).toHaveBeenCalledWith('erasure_failed');
    });

    it('company inexistente na leitura responde account_closed sem apagar nada', async () => {
        const doubles: Doubles = build({ company: null });

        await expect(doubles.application.delete('pessoa.teste@example.test')).rejects.toBeInstanceOf(AccountClosedError);

        expect(doubles.order).toEqual([]);
    });

    it('company que sumiu durante a exclusão desfaz a transação sem enviar e-mail', async () => {
        const doubles: Doubles = build({ eraseCompany: false });

        await expect(doubles.application.delete('pessoa.teste@example.test')).rejects.toBeInstanceOf(AccountClosedError);

        expect(doubles.enqueue).not.toHaveBeenCalled();
    });
});
