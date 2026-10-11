import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { AlsAppContext } from '../context/als-app-context';
import { LogService } from './log.service';

function fakeLogger(): { logger: PinoLogger; calls: { level: string; obj: unknown; msg: string }[] } {
    const calls: { level: string; obj: unknown; msg: string }[] = [];
    const logger: PinoLogger = {
        info: (obj: unknown, msg: string) => calls.push({ level: 'info', obj, msg }),
        warn: (obj: unknown, msg: string) => calls.push({ level: 'warn', obj, msg }),
        error: (obj: unknown, msg: string) => calls.push({ level: 'error', obj, msg }),
        debug: (obj: unknown, msg: string) => calls.push({ level: 'debug', obj, msg })
    } as unknown as PinoLogger;
    return { logger, calls };
}

describe('LogService', () => {
    it('enriches every line with the current requestId/companyId/locale from the AppContext', () => {
        const context: AlsAppContext = new AlsAppContext();
        const { logger, calls } = fakeLogger();
        const logs: LogService = new LogService(logger, context);

        context.run({ requestId: 'req-1', companyId: 'company-1', locale: 'en' }, () => {
            logs.info({ message: 'something happened', identifier: 'sample', meta: { key: 'value' } });
        });

        expect(calls).toHaveLength(1);
        expect(calls[0]?.msg).toBe('something happened');
        expect(calls[0]?.obj).toMatchObject({
            identifier: 'sample',
            meta: { key: 'value' },
            requestId: 'req-1',
            companyId: 'company-1',
            locale: 'en'
        });
    });

    it('serializes an Error into name/message/stack instead of an opaque object', () => {
        const context: AlsAppContext = new AlsAppContext();
        const { logger, calls } = fakeLogger();
        const logs: LogService = new LogService(logger, context);

        logs.error({ message: 'boom', identifier: 'sample', error: new Error('kaboom') });

        expect((calls[0]?.obj as { err?: { message?: string } }).err?.message).toBe('kaboom');
    });

    it('serializes a non-Error thrown value as a JSON string', () => {
        const context: AlsAppContext = new AlsAppContext();
        const { logger, calls } = fakeLogger();
        const logs: LogService = new LogService(logger, context);

        logs.warn({ message: 'weird failure', identifier: 'sample', error: { code: 'x' } });

        expect((calls[0]?.obj as { err?: { value?: string } }).err?.value).toBe('{"code":"x"}');
    });

    it('logs fine outside of an AppContext.run scope, without requestId/companyId', () => {
        const context: AlsAppContext = new AlsAppContext();
        const { logger, calls } = fakeLogger();
        const logs: LogService = new LogService(logger, context);

        logs.debug({ message: 'debug line', identifier: 'sample' });

        expect(calls[0]?.obj).toMatchObject({ requestId: undefined, companyId: undefined });
    });

    it('has no effect other than the underlying pino call', () => {
        const context: AlsAppContext = new AlsAppContext();
        const { logger } = fakeLogger();
        const logs: LogService = new LogService(logger, context);
        const spy: ReturnType<typeof vi.fn> = vi.fn();
        logger.info = spy;

        logs.info({ message: 'msg', identifier: 'sample' });

        expect(spy).toHaveBeenCalledOnce();
    });
});
