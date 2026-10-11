import { describe, expect, it, vi } from 'vitest';
import { LogService } from '../../../core/observability/log.service';
import { MetricsService } from '../../../core/observability/metrics.service';
import {
    buildFixture,
    CLIENT_ID,
    configOf,
    Fixture,
    ITEM_ITAU,
    ITEM_NUBANK,
    SENTINEL,
    COMPANY_ID
} from '../../../../test/support/bank-connections-fakes';
import { PluggyCredentialsPlain } from '../drivers/pluggy-session';
import { BankConnectionReaderService } from './bank-connection-reader.service';
import { BankConnectionsLogService } from './bank-connections-log.service';
import { BankConnectionsMetricsService, statusClassOf } from './bank-connections-metrics.service';
import { BankSyncPublisherService, hourStampOf, manualStampOf, syncJobId } from './bank-sync-publisher.service';
import { PluggyAvailabilityService } from './pluggy-availability.service';
import { PluggyCredentialsResealer } from './pluggy-credentials.resealer';

async function withConnections(): Promise<Fixture> {
    const fixture: Fixture = buildFixture();
    await fixture.credentialsApplication.save({ clientId: CLIENT_ID, clientSecret: SENTINEL });
    await fixture.connectionsApplication.connect([ITEM_NUBANK, ITEM_ITAU]);
    return fixture;
}

describe('CredentialsVaultService', () => {
    it('abre o par selado com o contexto da company', async () => {
        const fixture: Fixture = buildFixture();
        await fixture.vault.store(await fixture.vault.seal(new PluggyCredentialsPlain(CLIENT_ID, SENTINEL)));

        const opened: PluggyCredentialsPlain = await fixture.vault.openForCurrentCompany();

        expect(opened.pair()).toEqual({ clientId: CLIENT_ID, clientSecret: SENTINEL });
    });

    it('lança credentials_missing quando não há credencial', async () => {
        const fixture: Fixture = buildFixture();

        await expect(fixture.vault.openForCurrentCompany()).rejects.toMatchObject({ code: 'connections.credentials_missing' });
        await expect(fixture.vault.openStored()).rejects.toMatchObject({ code: 'connections.credentials_missing' });
    });

    it('recusa abrir a credencial marcada inválida, mas openStored ainda abre para o reteste', async () => {
        const fixture: Fixture = buildFixture();
        await fixture.vault.store(await fixture.vault.seal(new PluggyCredentialsPlain(CLIENT_ID, SENTINEL)));
        await fixture.vault.markInvalid('invalid_credentials');

        await expect(fixture.vault.openForCurrentCompany()).rejects.toMatchObject({ code: 'connections.invalid_credentials' });
        expect((await fixture.vault.openStored()).clientIdValue).toBe(CLIENT_ID);
    });

    it('trata selado que não abre mais como credencial inválida e a marca', async () => {
        const fixture: Fixture = buildFixture();
        await fixture.vault.store({ sealed: 'lixo', sealerDriver: 'local', clientIdHint: 'abcd…wxyz', verifiedWith: 'mock' });

        await expect(fixture.vault.openForCurrentCompany()).rejects.toMatchObject({ code: 'connections.invalid_credentials' });

        expect(fixture.credentials.rows[0]).toMatchObject({ status: 'invalid', lastErrorCode: 'secret_unreadable' });
    });

    it('propaga falha do cofre que não seja de abertura', async () => {
        const fixture: Fixture = buildFixture();
        await fixture.vault.store(await fixture.vault.seal(new PluggyCredentialsPlain(CLIENT_ID, SENTINEL)));
        vi.spyOn(fixture.sealer, 'open').mockRejectedValue(new Error('kms fora'));

        await expect(fixture.vault.openForCurrentCompany()).rejects.toThrow('kms fora');
    });

    it('marcar inválida sem credencial não faz nada', async () => {
        const fixture: Fixture = buildFixture();

        await expect(fixture.vault.markInvalid('x')).resolves.toBeUndefined();
    });
});

describe('BankConnectionReaderService', () => {
    it('conta as conexões e devolve só id e companyId para o fan-out', async () => {
        const fixture: Fixture = await withConnections();
        fixture.connections.setStatus(fixture.connections.rows[1]?.id ?? '', 'paused');
        const reader: BankConnectionReaderService = new BankConnectionReaderService(fixture.connectionDomain);

        expect(await reader.countActive()).toBe(2);
        expect(await reader.listActiveAcrossTenants()).toEqual([{ id: fixture.connections.rows[0]?.id, companyId: COMPANY_ID }]);
        expect(await reader.findByIdAcrossTenants(fixture.connections.rows[0]?.id ?? '')).toEqual({
            id: fixture.connections.rows[0]?.id,
            companyId: COMPANY_ID
        });
        expect(await reader.findByIdAcrossTenants('nope')).toBeNull();
    });
});

describe('BankSyncPublisherService', () => {
    it('monta o job id determinístico pelo que distingue duas execuções legítimas de cada gatilho', () => {
        const at: Date = new Date('2026-10-11T09:45:12.345Z');

        expect(hourStampOf(at)).toBe('2026101109');
        expect(manualStampOf(at)).toBe('202610110940');
        expect(syncJobId('c1', 'initial', at)).toBe('pluggy-sync-c1-initial-2026101109');
        expect(syncJobId('c1', 'daily', at)).toBe('pluggy-sync-c1-daily-20261011');
        expect(syncJobId('c1', 'manual', at)).toBe('pluggy-sync-c1-manual-202610110940');
        expect(syncJobId('c1', 'credentials_rotated', at)).toBe('pluggy-sync-c1-credentials_rotated-20261011094512345');
    });

    it('duas rotações de credencial na mesma hora não colidem no job id', () => {
        const first: string = syncJobId('c1', 'credentials_rotated', new Date('2026-10-11T09:10:00.000Z'));
        const second: string = syncJobId('c1', 'credentials_rotated', new Date('2026-10-11T09:50:30.100Z'));

        expect(first).not.toBe(second);
    });

    it('o daily usa o dia de São Paulo e duas execuções do mesmo dia compartilham o job id', () => {
        const morning: string = syncJobId('c1', 'daily', new Date('2026-10-11T10:00:00.000Z'));
        const evening: string = syncJobId('c1', 'daily', new Date('2026-10-12T01:00:00.000Z'));
        const next: string = syncJobId('c1', 'daily', new Date('2026-10-12T10:00:00.000Z'));

        expect(evening).toBe(morning);
        expect(next).not.toBe(morning);
    });

    it('falha de fila depois do commit vira warn e não derruba a chamada', async () => {
        const warn: ReturnType<typeof vi.fn> = vi.fn();
        const logs: BankConnectionsLogService = new BankConnectionsLogService({ warn } as unknown as LogService);
        const publisher: BankSyncPublisherService = new BankSyncPublisherService(
            { publish: vi.fn().mockRejectedValue(new Error('redis fora')) },
            { getOrNull: () => ({ companyId: COMPANY_ID }) } as never,
            logs
        );

        await expect(publisher.publishAll(['c1', 'c2'], 'initial')).resolves.toBeUndefined();

        expect(warn).toHaveBeenCalledTimes(2);
        expect(warn.mock.calls[0]?.[0]).toMatchObject({
            identifier: 'bank-connections-sync-publish',
            meta: { connectionId: 'c1', trigger: 'initial' }
        });
    });

    it('falha alto sem contexto de company', async () => {
        const publisher: BankSyncPublisherService = new BankSyncPublisherService(
            { publish: vi.fn() },
            { getOrNull: () => null } as never,
            {} as never
        );

        await expect(publisher.publishAll(['c1'], 'initial')).rejects.toMatchObject({ code: 'core.missing_tenant_context' });
    });
});

describe('PluggyCredentialsEraser e exportação', () => {
    it('apaga as credenciais da company e é idempotente', async () => {
        const fixture: Fixture = buildFixture();
        await fixture.credentialsApplication.save({ clientId: CLIENT_ID, clientSecret: SENTINEL });

        expect(fixture.eraser.area).toBe('pluggy_credentials');
        expect(await fixture.eraser.eraseAll(COMPANY_ID)).toBe(1);
        expect(await fixture.eraser.eraseAll(COMPANY_ID)).toBe(0);
    });

    it('exporta dica, status e conexões sem selado, client id nem item id inteiro', async () => {
        const fixture: Fixture = await withConnections();
        fixture.connections.rows[0] = {
            ...(fixture.connections.rows[0] as NonNullable<(typeof fixture.connections.rows)[0]>),
            lastSuccessAt: new Date('2026-10-10T10:00:00.000Z')
        };

        const exported = await fixture.exporter.exportAll(COMPANY_ID);

        expect(fixture.exporter.area).toBe('bank_connections');
        expect(exported.credentials).toEqual({ configured: true, clientIdHint: '3f9a…a5b6', status: 'valid' });
        expect(exported.connections).toEqual([
            expect.objectContaining({
                connectorName: 'Nubank',
                itemIdHint: '0000…a001',
                status: 'active',
                lastSuccessAt: '2026-10-10T10:00:00.000Z'
            }),
            expect.objectContaining({ connectorName: 'Itaú', itemIdHint: '0000…a002', lastSuccessAt: null })
        ]);
        const text: string = JSON.stringify(exported);
        expect(text).not.toContain(SENTINEL);
        expect(text).not.toContain(CLIENT_ID);
        expect(text).not.toContain(ITEM_NUBANK);
        expect(text).not.toContain(fixture.credentials.rows[0]?.sealed ?? 'x');
    });

    it('exporta null quando não há credencial', async () => {
        const fixture: Fixture = buildFixture();

        expect(await fixture.exporter.exportAll(COMPANY_ID)).toEqual({ credentials: null, connections: [] });
    });
});

describe('PluggyCredentialsResealer', () => {
    it('lista o selado da company e troca por um novo com o driver atual', async () => {
        const fixture: Fixture = buildFixture();
        await fixture.credentialsApplication.save({ clientId: CLIENT_ID, clientSecret: SENTINEL });
        const resealer: PluggyCredentialsResealer = new PluggyCredentialsResealer(fixture.credentialsDomain, fixture.sealer);
        const [record] = await resealer.listSealed(COMPANY_ID);

        await resealer.replaceSealed(COMPANY_ID, record?.id ?? '', 'novo-selado');

        expect(resealer.purpose).toBe('pluggy-credentials');
        expect(await resealer.listCompanyIds()).toEqual([COMPANY_ID]);
        expect(fixture.credentials.rows[0]).toMatchObject({ sealed: 'novo-selado', sealerDriver: 'local' });
    });

    it('não lista nada quando não há credencial', async () => {
        const fixture: Fixture = buildFixture();
        const resealer: PluggyCredentialsResealer = new PluggyCredentialsResealer(fixture.credentialsDomain, fixture.sealer);

        expect(await resealer.listSealed(COMPANY_ID)).toEqual([]);
    });
});

describe('BankConnectionsLogService e BankConnectionsMetricsService', () => {
    it('registra os identificadores do card sem credencial nem item completo', () => {
        const info: ReturnType<typeof vi.fn> = vi.fn();
        const warn: ReturnType<typeof vi.fn> = vi.fn();
        const debug: ReturnType<typeof vi.fn> = vi.fn();
        const logs: BankConnectionsLogService = new BankConnectionsLogService({ info, warn, debug } as unknown as LogService);

        logs.credentials('saved', 'valid');
        logs.item('c1', 'connected', 'UPDATED');
        logs.providerCall('auth', 200, null, null);
        logs.providerCall('item', 429, 'rate_limited', 60);

        expect(info.mock.calls.map((call: unknown[]) => (call[0] as { identifier: string }).identifier)).toEqual([
            'bank-connections-credentials',
            'bank-connections-item'
        ]);
        expect(debug.mock.calls[0]?.[0]).toMatchObject({ identifier: 'bank-connections-provider' });
        expect(warn.mock.calls[0]?.[0]).toMatchObject({
            meta: { endpoint: 'item', status: 429, reason: 'rate_limited', retryAfterSeconds: 60 }
        });
    });

    it('conta as chamadas à Pluggy por classe de status e as credenciais por ação', () => {
        const count: ReturnType<typeof vi.fn> = vi.fn();
        const metrics: BankConnectionsMetricsService = new BankConnectionsMetricsService({ count } as unknown as MetricsService);

        metrics.providerRequest('auth', 200);
        metrics.credentials('rotated', 'ok');

        expect(count.mock.calls).toEqual([
            ['vera_pluggy_requests_total', { endpoint: 'auth', status: '2xx' }],
            ['vera_pluggy_credentials_total', { action: 'rotated', result: 'ok' }]
        ]);
    });

    it.each([
        [200, '2xx'],
        [302, 'other'],
        [100, 'other'],
        [401, '4xx'],
        [429, '429'],
        [503, '5xx'],
        [null, 'network']
    ])('classifica o status %s como %s', (status, expected) => {
        expect(statusClassOf(status)).toBe(expected);
    });
});

describe('PluggyAvailabilityService e driver verificado', () => {
    it('bloqueia o mock fora do ambiente local e libera no local ou com o live', () => {
        const blocked: PluggyAvailabilityService = new PluggyAvailabilityService(configOf({ PLUGGY_MOCK_ALLOWED: false }));

        expect(() => {
            blocked.assertEnabled();
        }).toThrowError('connections.provider_disabled');
        expect(() => {
            new PluggyAvailabilityService(configOf()).assertEnabled();
        }).not.toThrow();
        expect(() => {
            new PluggyAvailabilityService(configOf({ PLUGGY_DRIVER: 'live', PLUGGY_MOCK_ALLOWED: false })).assertEnabled();
        }).not.toThrow();
        expect(blocked.driver).toBe('mock');
    });

    it('grava com qual driver a credencial foi verificada', async () => {
        const fixture: Fixture = buildFixture();

        await fixture.credentialsApplication.save({ clientId: CLIENT_ID, clientSecret: SENTINEL });

        expect(fixture.credentials.rows[0]?.verifiedWith).toBe('mock');
    });

    it('credencial verificada com outro driver exige novo teste e o teste a revalida', async () => {
        const fixture: Fixture = buildFixture();
        await fixture.credentialsApplication.save({ clientId: CLIENT_ID, clientSecret: SENTINEL });
        const live: Fixture = buildFixture({ config: { PLUGGY_DRIVER: 'live' } });
        live.credentials.rows = fixture.credentials.rows;

        await expect(live.vault.openForCurrentCompany()).rejects.toMatchObject({ code: 'connections.invalid_credentials' });
        expect(live.credentials.rows[0]).toMatchObject({ status: 'invalid', lastErrorCode: 'driver_changed' });
        await expect(live.connectionsApplication.connect([ITEM_NUBANK])).rejects.toMatchObject({ code: 'connections.invalid_credentials' });
        await live.vault.markValid();
        expect(live.credentials.rows[0]).toMatchObject({ status: 'valid', verifiedWith: 'live' });
    });

    it('as rotas de credencial e de conexão respondem provider_disabled com o mock fora do local', async () => {
        const fixture: Fixture = buildFixture({ config: { PLUGGY_MOCK_ALLOWED: false } });

        await expect(fixture.credentialsApplication.save({ clientId: CLIENT_ID, clientSecret: SENTINEL })).rejects.toMatchObject({
            code: 'connections.provider_disabled',
            status: 503
        });
        await expect(fixture.credentialsApplication.test()).rejects.toMatchObject({ code: 'connections.provider_disabled' });
        await expect(fixture.connectionsApplication.connect([ITEM_NUBANK])).rejects.toMatchObject({
            code: 'connections.provider_disabled'
        });
        expect(fixture.credentials.rows).toEqual([]);
    });
});
