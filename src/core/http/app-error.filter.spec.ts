import { ArgumentsHost, HttpException, NotFoundException } from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppError } from '../../shared/errors/app.error';
import { AlsAppContext } from '../context/als-app-context';
import { LogService } from '../observability/log.service';
import { AppErrorFilter } from './app-error.filter';

class ItemNotFoundError extends AppError {
    public constructor(itemId: string) {
        super({ code: 'sample.item_not_found', status: 404, detail: `Item ${itemId} does not exist.`, meta: { itemId } });
    }
}

class ProductNotFoundError extends AppError {
    public constructor() {
        super({ code: 'billing.product_not_found', status: 500, meta: { product: 'engine' } });
    }
}

interface Setup {
    readonly filter: AppErrorFilter;
    readonly context: AlsAppContext;
    readonly status: ReturnType<typeof vi.fn>;
    readonly json: ReturnType<typeof vi.fn>;
    readonly host: ArgumentsHost;
    readonly error: ReturnType<typeof vi.fn>;
}

function setup(): Setup {
    const context: AlsAppContext = new AlsAppContext();
    const error: ReturnType<typeof vi.fn> = vi.fn();
    const logService: LogService = { error, warn: vi.fn(), info: vi.fn(), debug: vi.fn() } as unknown as LogService;
    const json: ReturnType<typeof vi.fn> = vi.fn();
    const status: ReturnType<typeof vi.fn> = vi.fn(() => ({ json }));
    const host: ArgumentsHost = {
        switchToHttp: () => ({ getResponse: () => ({ status }) })
    } as unknown as ArgumentsHost;
    return { filter: new AppErrorFilter(context, logService), context, status, json, host, error };
}

function sentBody(json: ReturnType<typeof vi.fn>): Record<string, unknown> {
    return json.mock.calls[0]?.[0] as Record<string, unknown>;
}

describe('AppErrorFilter', () => {
    it('maps an AppError to problem+json carrying its own technical detail, not a translated catalog message', () => {
        const { filter, context, status, json, host }: Setup = setup();

        context.run({ requestId: 'req-9', locale: 'pt-BR' }, () => {
            filter.catch(new ItemNotFoundError('ch-1'), host);
        });

        expect(status).toHaveBeenCalledWith(404);
        expect(sentBody(json)).toMatchObject({
            type: 'sample.item_not_found',
            title: 'ItemNotFoundError',
            status: 404,
            detail: 'Item ch-1 does not exist.',
            requestId: 'req-9',
            meta: { itemId: 'ch-1' }
        });
    });

    it('falls back to the error code as detail when the AppError does not set one', () => {
        const { filter, json, host }: Setup = setup();

        filter.catch(new ProductNotFoundError(), host);

        expect(sentBody(json).detail).toBe('billing.product_not_found');
        expect(sentBody(json).requestId).toBeNull();
    });

    it('maps a 400 HttpException to the validation code', () => {
        const { filter, status, json, host }: Setup = setup();
        const exception: ZodValidationException = new ZodValidationException(
            z.object({ name: z.string() }).safeParse({}).error as z.ZodError
        );

        filter.catch(exception, host);

        expect(status).toHaveBeenCalledWith(400);
        expect(sentBody(json)).toMatchObject({ type: 'validation_failed', status: 400 });
    });

    it('maps an unmapped 4xx HttpException with a string response to the generic http code', () => {
        const { filter, status, json, host }: Setup = setup();

        filter.catch(new HttpException('teapot', 418), host);

        expect(status).toHaveBeenCalledWith(418);
        const body: Record<string, unknown> = sentBody(json);
        expect(body.type).toBe('http_error');
        expect(body.detail).toBe('teapot');
        expect(body.requestId).toBeNull();
    });

    it('keeps the response object of a non-400 HttpException as meta', () => {
        const { filter, status, json, host }: Setup = setup();

        filter.catch(new NotFoundException('missing'), host);

        expect(status).toHaveBeenCalledWith(404);
        expect(sentBody(json).meta).toMatchObject({ statusCode: 404 });
    });

    it('maps an unknown exception to 500 with a fixed English detail and logs it', () => {
        const { filter, status, json, host, error }: Setup = setup();

        filter.catch(new TypeError('boom'), host);

        expect(status).toHaveBeenCalledWith(500);
        expect(sentBody(json)).toMatchObject({
            type: 'internal_error',
            title: 'InternalServerError',
            status: 500,
            detail: 'Unexpected error.'
        });
        expect(error).toHaveBeenCalledOnce();
    });

    it('logs a 5xx AppError with its code and meta, so a silent 500 cannot happen', () => {
        const { filter, context, host, error }: Setup = setup();

        context.run({ requestId: 'req-9', locale: 'pt-BR' }, () => {
            filter.catch(new ProductNotFoundError(), host);
        });

        expect(error).toHaveBeenCalledWith(
            expect.objectContaining({ meta: expect.objectContaining({ code: 'billing.product_not_found', product: 'engine' }) })
        );
    });

    it('keeps a 4xx out of the error log, which would be noise on every not found', () => {
        const { filter, host, error }: Setup = setup();

        filter.catch(new ItemNotFoundError('c1'), host);

        expect(error).not.toHaveBeenCalled();
    });

    it.each([
        [401, 'unauthorized'],
        [403, 'forbidden'],
        [404, 'not_found'],
        [429, 'too_many_requests'],
        [503, 'internal_error']
    ])('maps an HttpException with status %i to the code %s', (code: number, type: string) => {
        const { filter, json, host }: Setup = setup();

        filter.catch(new HttpException('x', code), host);

        expect(sentBody(json).type).toBe(type);
    });
});
