import { ArgumentsHost } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it } from 'vitest';
import { AppContext } from '../../core/context/app-context.port';
import { AppErrorFilter } from '../../core/http/app-error.filter';
import { LogService } from '../../core/observability/log.service';
import {
    buildFixture,
    CLIENT_ID,
    Fixture,
    ITEM_ITAU,
    ITEM_MISSING,
    ITEM_NUBANK,
    SENTINEL,
    COMPANY_ID
} from '../../../test/support/bank-connections-fakes';
import { PluggyCredentialsPlain } from './drivers/pluggy-session';
import { PluggyUnavailableError } from './ports/pluggy-client.errors';
import { SecretSafeValidationPipe } from './validation/secret-safe-validation.pipe';
import { saveCredentialsSchema } from './validation/bank-connections.schemas';

interface Capture {
    readonly lines: unknown[];
    readonly filter: AppErrorFilter;
    readonly bodies: unknown[];
}

function captureFilter(): Capture {
    const lines: unknown[] = [];
    const bodies: unknown[] = [];
    const pino: PinoLogger = {
        info: (...args: unknown[]): number => lines.push(args),
        warn: (...args: unknown[]): number => lines.push(args),
        error: (...args: unknown[]): number => lines.push(args),
        debug: (...args: unknown[]): number => lines.push(args)
    } as unknown as PinoLogger;
    const context: AppContext = { getOrNull: () => ({ requestId: 'request-1', companyId: COMPANY_ID }) } as unknown as AppContext;
    const filter: AppErrorFilter = new AppErrorFilter(context, new LogService(pino, context));
    return { lines, filter, bodies };
}

function respondThrough(capture: Capture, error: unknown): void {
    const response: { status: (code: number) => { json: (body: unknown) => void } } = {
        status: () => ({ json: (body: unknown): number => capture.bodies.push(body) })
    };
    capture.filter.catch(error, { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost);
}

async function attempt(capture: Capture, action: () => Promise<unknown>): Promise<unknown> {
    try {
        return await action();
    } catch (error: unknown) {
        respondThrough(capture, error);
        return error;
    }
}

describe('sigilo do segredo da Pluggy', () => {
    it('a sentinela não aparece em log, métrica, resposta, erro, job publicado nem export, em nenhum fluxo', async () => {
        const capture: Capture = captureFilter();
        const outputs: unknown[] = [];
        const fixture: Fixture = buildFixture();
        const secret: { clientId: string; clientSecret: string } = { clientId: CLIENT_ID, clientSecret: SENTINEL };

        outputs.push(await fixture.credentialsApplication.save(secret));
        outputs.push(await fixture.credentialsApplication.get());
        outputs.push(await fixture.credentialsApplication.test());
        outputs.push(await fixture.connectionsApplication.connect([ITEM_NUBANK, ITEM_ITAU, ITEM_MISSING]));
        outputs.push(await fixture.connectionsApplication.overview());
        outputs.push(await fixture.exporter.exportAll(COMPANY_ID));
        outputs.push(await fixture.credentialsApplication.save({ ...secret, clientSecret: `${SENTINEL}-rotacionado` }));

        const rejecting: Fixture = buildFixture({ config: { MOCK_PLUGGY_FORCE_401: true } });
        outputs.push(await attempt(capture, async () => rejecting.credentialsApplication.save(secret)));

        const down: Fixture = buildFixture({
            client: {
                authenticate: () => Promise.reject(new PluggyUnavailableError('server_error', 503, null)),
                getItem: () => Promise.reject(new PluggyUnavailableError('server_error', 503, null)),
                listAccounts: () => Promise.resolve([]),
                listTransactions: () => Promise.resolve({ items: [], next: null })
            }
        });
        outputs.push(await attempt(capture, async () => down.credentialsApplication.save(secret)));
        await down.credentialsDomain.replace(await down.vault.seal(new PluggyCredentialsPlain(CLIENT_ID, SENTINEL)));
        outputs.push(await attempt(capture, async () => down.connectionsApplication.connect([ITEM_NUBANK])));
        outputs.push(await attempt(capture, async () => down.credentialsApplication.test()));

        const pipe: SecretSafeValidationPipe<unknown> = new SecretSafeValidationPipe(saveCredentialsSchema);
        outputs.push(await attempt(capture, async () => Promise.resolve(pipe.transform({ clientId: SENTINEL, clientSecret: SENTINEL }))));

        const everything: string = JSON.stringify({
            outputs,
            logs: [fixture, rejecting, down].map((entry: Fixture) => entry.logCalls),
            metrics: [fixture, rejecting, down].map((entry: Fixture) => entry.metricCalls),
            published: [fixture, rejecting, down].map((entry: Fixture) => entry.publisher.published),
            filterLines: capture.lines,
            filterBodies: capture.bodies,
            sealed: [fixture, rejecting, down].map((entry: Fixture) => entry.credentials.rows.map((row) => row.sealed))
        });
        expect(everything).not.toContain('vera-sentinel');
        expect(everything).not.toContain(SENTINEL);
        expect(everything).not.toContain(CLIENT_ID);
        expect(everything).not.toContain(ITEM_NUBANK);
        expect(capture.bodies.length).toBeGreaterThan(0);
    });

    it('o selado no repositório não contém o texto do segredo nem do client id', async () => {
        const fixture: Fixture = buildFixture();

        await fixture.credentialsApplication.save({ clientId: CLIENT_ID, clientSecret: SENTINEL });

        const sealed: string = fixture.credentials.rows[0]?.sealed ?? '';
        expect(sealed).not.toContain(SENTINEL);
        expect(sealed).not.toContain(CLIENT_ID);
        expect(Buffer.from(sealed, 'base64url').toString('utf8')).not.toContain(SENTINEL);
    });
});
