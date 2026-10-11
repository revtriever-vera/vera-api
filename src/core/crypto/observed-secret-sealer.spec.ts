import { randomUUID } from 'node:crypto';
import { DecryptCommand, KMSClient } from '@aws-sdk/client-kms';
import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../context/app-context.port';
import { LogService } from '../observability/log.service';
import { MetricsService } from '../observability/metrics.service';
import { KmsSecretSealerDriver } from './drivers/kms-secret-sealer.driver';
import { LocalSecretSealerDriver } from './drivers/local-secret-sealer.driver';
import { ObservedSecretSealer } from './observed-secret-sealer';
import { SealContext, SecretSealerPort } from './secret-sealer.port';

const CONTEXT: SealContext = { companyId: 'company-a', purpose: 'test-purpose' };

interface Harness {
    readonly lines: string[];
    readonly counts: { name: string; labels: Record<string, string> }[];
    readonly logs: LogService;
    readonly metrics: MetricsService;
}

function harness(): Harness {
    const lines: string[] = [];
    const record = (payload: unknown, message: string): void => {
        lines.push(JSON.stringify({ payload, message }));
    };
    const pino = { info: record, warn: record, error: record, debug: record } as unknown as PinoLogger;
    const context = { getOrNull: (): null => null } as unknown as AppContext;
    const counts: Harness['counts'] = [];
    const metrics = {
        count: (name: string, labels: Record<string, string>): void => {
            counts.push({ name, labels });
        }
    } as unknown as MetricsService;
    return { lines, counts, logs: new LogService(pino, context), metrics };
}

function failingKms(sentinel: string): KMSClient {
    const send = vi.fn((command: unknown): Promise<unknown> => {
        if (command instanceof DecryptCommand) {
            return Promise.reject(new Error(`AccessDeniedException: ${sentinel}`));
        }
        return Promise.resolve({
            Plaintext: new Uint8Array(32).fill(7),
            CiphertextBlob: Buffer.from('wrapped-key'),
            KeyId: 'key-ref-1'
        });
    });
    return { send } as unknown as KMSClient;
}

describe('ObservedSecretSealer', () => {
    it('counts successful operations and logs nothing', async () => {
        const h: Harness = harness();
        const sealer: SecretSealerPort = new ObservedSecretSealer(new LocalSecretSealerDriver('a'.repeat(64)), h.logs, h.metrics);

        await sealer.open(await sealer.seal('value', CONTEXT), CONTEXT);

        expect(h.lines).toEqual([]);
        expect(h.counts).toEqual([
            { name: 'vera_secret_sealer_total', labels: { driver: 'local', op: 'seal', result: 'ok' } },
            { name: 'vera_secret_sealer_total', labels: { driver: 'local', op: 'open', result: 'ok' } }
        ]);
    });

    it('exposes the driver of the wrapped sealer', () => {
        const h: Harness = harness();

        expect(new ObservedSecretSealer(new LocalSecretSealerDriver('a'.repeat(64)), h.logs, h.metrics).driver).toBe('local');
    });

    it('logs only driver, purpose, operation and a neutral reason on failure, and rethrows', async () => {
        const h: Harness = harness();
        const sealer: SecretSealerPort = new ObservedSecretSealer(new LocalSecretSealerDriver('a'.repeat(64)), h.logs, h.metrics);

        await expect(sealer.open('nonsense!', CONTEXT)).rejects.toMatchObject({ code: 'core.secret_open_failed' });

        expect(h.lines).toHaveLength(1);
        const entry = JSON.parse(h.lines[0] ?? '{}') as { payload: { identifier: string; meta: Record<string, string> } };
        expect(entry.payload.identifier).toBe('secret-sealer');
        expect(entry.payload.meta).toEqual({
            driver: 'local',
            purpose: 'test-purpose',
            op: 'open',
            reason: 'core.secret_open_failed'
        });
        expect(h.counts).toEqual([{ name: 'vera_secret_sealer_total', labels: { driver: 'local', op: 'open', result: 'error' } }]);
    });

    it('reports an unexpected error with a neutral reason', async () => {
        const h: Harness = harness();
        const broken: SecretSealerPort = {
            driver: 'local',
            seal: vi.fn(async () => Promise.reject(new Error('boom with detail'))),
            open: vi.fn()
        } as unknown as SecretSealerPort;

        await expect(new ObservedSecretSealer(broken, h.logs, h.metrics).seal('value', CONTEXT)).rejects.toThrow('boom with detail');

        expect(h.lines.join('')).toContain('unexpected');
        expect(h.lines.join('')).not.toContain('boom with detail');
    });

    it('never leaves the sentinel, the sealed value or the wrapped key in logs or metrics, in a local flow with forced failures', async () => {
        const sentinel: string = `vera-sentinel-${randomUUID()}`;
        const h: Harness = harness();
        const sealer: SecretSealerPort = new ObservedSecretSealer(new LocalSecretSealerDriver('a'.repeat(64)), h.logs, h.metrics);

        const sealed: string = await sealer.seal(sentinel, CONTEXT);
        await sealer.open(sealed, CONTEXT);
        await sealer.open(sealed, { ...CONTEXT, companyId: 'company-b' }).catch(() => undefined);
        await sealer.open(`${sealed.slice(0, -4)}AAAA`, CONTEXT).catch(() => undefined);

        const output: string = JSON.stringify([h.lines, h.counts]);
        expect(h.lines.length).toBeGreaterThan(0);
        expect(output).not.toContain(sentinel);
        expect(output).not.toContain(sealed);
    });

    it('never leaks the sentinel or the provider message with kms failures', async () => {
        const sentinel: string = `vera-sentinel-${randomUUID()}`;
        const h: Harness = harness();
        const sealer: SecretSealerPort = new ObservedSecretSealer(
            new KmsSecretSealerDriver(failingKms(sentinel), 'alias/test', null),
            h.logs,
            h.metrics
        );

        const sealed: string = await sealer.seal(sentinel, CONTEXT);
        const failure: unknown = await sealer.open(sealed, CONTEXT).catch((error: unknown) => error);

        const output: string = JSON.stringify([h.lines, h.counts, String(failure), (failure as Error).stack]);
        expect(h.lines).toHaveLength(1);
        expect(output).not.toContain(sentinel);
        expect(output).not.toContain(sealed);
        expect(output).not.toContain(Buffer.from('wrapped-key').toString('base64url'));
        expect(output).not.toContain('AccessDeniedException');
    });
});
