import { describe, expect, it, vi } from 'vitest';
import { AlsAppContext } from '../../../core/context/als-app-context';
import { TooManyAttemptsError } from '../../../core/throttle/throttle.service';
import { ThrottleService } from '../../../core/throttle/throttle.service';
import { AccountExportFailedError, UnauthorizedError } from '../domain/identity.errors';
import { AccountDataRegistry } from '../services/account-data.registry';
import { IdentityAccountExport, IdentityAccountExporter } from '../services/identity-account.exporter';
import { IdentityLogService } from '../services/identity-log.service';
import { IdentityMetricsService } from '../services/identity-metrics.service';
import { AccountExportApplication, AccountExportFile } from './account-export.application';

const ACCOUNT: IdentityAccountExport = {
    company: { name: 'Empresa Teste', locale: 'pt-BR', timezone: 'America/Sao_Paulo', createdAt: '2026-01-01T00:00:00.000Z' },
    user: {
        name: 'Pessoa Teste',
        email: 'pessoa@example.test',
        role: 'owner',
        locale: null,
        termsAcceptedAt: null,
        createdAt: '2026-01-01T00:00:00.000Z'
    },
    identities: [],
    sessions: []
};

interface Doubles {
    readonly application: AccountExportApplication;
    readonly assertAllowed: ReturnType<typeof vi.fn>;
    readonly accountExport: ReturnType<typeof vi.fn>;
    readonly exportRequested: ReturnType<typeof vi.fn>;
    readonly inRequest: <T>(fn: () => Promise<T>, withUser?: boolean) => Promise<T>;
}

function build(sections: () => Promise<Record<string, unknown>> = async () => Promise.resolve({ assets: { items: [] } })): Doubles {
    const assertAllowed: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined);
    const accountExport: ReturnType<typeof vi.fn> = vi.fn();
    const exportRequested: ReturnType<typeof vi.fn> = vi.fn();
    const context: AlsAppContext = new AlsAppContext();
    const application: AccountExportApplication = new AccountExportApplication(
        { assertAllowed } as unknown as ThrottleService,
        { export: vi.fn().mockResolvedValue(ACCOUNT) } as unknown as IdentityAccountExporter,
        { exportSections: vi.fn().mockImplementation(sections) } as unknown as AccountDataRegistry,
        { exportRequested } as unknown as IdentityLogService,
        { accountExport } as unknown as IdentityMetricsService,
        context
    );
    const inRequest = async <T>(fn: () => Promise<T>, withUser: boolean = true): Promise<T> =>
        context.run({ requestId: 'r', locale: 'pt-BR', ...(withUser ? { userId: 'user-1', companyId: 'company-1' } : {}) }, fn);
    return { application, assertAllowed, accountExport, exportRequested, inRequest };
}

describe('AccountExportApplication', () => {
    it('junta account e sections no formato versionado e limita por usuário', async () => {
        const doubles: Doubles = build();

        const file: AccountExportFile = await doubles.inRequest(async () => doubles.application.export());

        expect(file.format).toBe('vera-export/1');
        expect(new Date(file.exportedAt).toISOString()).toBe(file.exportedAt);
        expect(file.account).toBe(ACCOUNT);
        expect(file.sections).toEqual({ assets: { items: [] } });
        expect(doubles.assertAllowed).toHaveBeenCalledWith('account-export:user-1', 3, 3600);
        expect(doubles.accountExport).toHaveBeenCalledWith('success');
        expect(doubles.exportRequested).toHaveBeenCalledWith(['assets']);
    });

    it('nunca inclui tokenHash no arquivo', async () => {
        const doubles: Doubles = build();

        const file: AccountExportFile = await doubles.inRequest(async () => doubles.application.export());

        expect(JSON.stringify(file)).not.toContain('tokenHash');
    });

    it('um exportador que falha derruba a resposta e conta a falha', async () => {
        const doubles: Doubles = build(async () => Promise.reject(new AccountExportFailedError('assets', new Error('boom'))));

        await expect(doubles.inRequest(async () => doubles.application.export())).rejects.toBeInstanceOf(AccountExportFailedError);
        expect(doubles.accountExport).toHaveBeenCalledWith('failed');
    });

    it('sem usuário no contexto responde unauthorized sem tocar no limite', async () => {
        const doubles: Doubles = build();

        await expect(doubles.inRequest(async () => doubles.application.export(), false)).rejects.toBeInstanceOf(UnauthorizedError);
        expect(doubles.assertAllowed).not.toHaveBeenCalled();
    });

    it('propaga o limite estourado sem exportar nada', async () => {
        const doubles: Doubles = build();
        doubles.assertAllowed.mockRejectedValue(new TooManyAttemptsError());

        await expect(doubles.inRequest(async () => doubles.application.export())).rejects.toBeInstanceOf(TooManyAttemptsError);
        expect(doubles.exportRequested).not.toHaveBeenCalled();
    });
});
