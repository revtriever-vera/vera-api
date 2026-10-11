import { AddressInfo, Server } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../../core/context/app-context.port';
import { AppErrorFilter } from '../../../../core/http/app-error.filter';
import { LogService } from '../../../../core/observability/log.service';
import { RateLimitGuard } from '../../../../core/throttle/rate-limit.guard';
import { JwtAuthGuard } from '../../../identity/services/jwt-auth.guard';
import { ImportCommitApplication } from '../../application/import-commit.application';
import { ImportListApplication } from '../../application/import-list.application';
import { ImportPreviewApplication } from '../../application/import-preview.application';
import { ImportsController } from './imports.controller';

const previews = { preview: vi.fn() };
const commits = { commit: vi.fn() };
const lists = { list: vi.fn(), undo: vi.fn() };

let app: INestApplication;
let origin: string;

beforeAll(async () => {
    const module = await Test.createTestingModule({
        controllers: [ImportsController],
        providers: [
            { provide: ImportPreviewApplication, useValue: previews },
            { provide: ImportCommitApplication, useValue: commits },
            { provide: ImportListApplication, useValue: lists },
            { provide: AppContext, useValue: { getOrNull: () => ({ requestId: 'req-1' }) } },
            { provide: LogService, useValue: { error: vi.fn() } },
            { provide: APP_PIPE, useClass: ZodValidationPipe },
            { provide: APP_FILTER, useClass: AppErrorFilter }
        ]
    })
        .overrideGuard(JwtAuthGuard)
        .useValue({ canActivate: () => true })
        .overrideGuard(RateLimitGuard)
        .useValue({ canActivate: () => true })
        .compile();
    app = module.createNestApplication();
    await app.init();
    await app.listen(0);
    origin = `http://127.0.0.1:${String(((app.getHttpServer() as Server).address() as AddressInfo).port)}`;
});

afterAll(async () => {
    await app.close();
});

beforeEach(() => {
    vi.clearAllMocks();
});

function form(file: Buffer | null, fields: Record<string, string> = {}, name: string = 'extrato.ofx'): FormData {
    const data: FormData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
        data.append(key, value);
    }
    if (file !== null) {
        data.append('file', new Blob([new Uint8Array(file)]), name);
    }
    return data;
}

async function post(path: string, body: FormData): Promise<{ status: number; body: Record<string, unknown> }> {
    const response: Response = await fetch(`${origin}${path}`, { method: 'POST', body });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const MAPPING: string = JSON.stringify({
    hasHeader: true,
    dateColumn: 0,
    descriptionColumn: 1,
    amountColumn: 2,
    dateFormat: 'dd/MM/yyyy',
    decimalSeparator: ',',
    invertSign: false
});

describe('POST /spending/imports/preview', () => {
    it('entrega o arquivo em memória, com o nome em UTF-8, e responde 200', async () => {
        previews.preview.mockResolvedValue({ format: 'ofx' });

        const response = await post('/spending/imports/preview', form(Buffer.from('conteúdo'), { format: 'ofx' }, 'extração.ofx'));

        expect(response.status).toBe(200);
        const [upload, input] = previews.preview.mock.calls[0] as [{ buffer: Buffer; originalname: string }, Record<string, unknown>];
        expect(upload.buffer.toString('utf-8')).toBe('conteúdo');
        expect(upload.originalname).toBe('extração.ofx');
        expect(input).toMatchObject({ format: 'ofx' });
    });

    it('passa o mapping já validado', async () => {
        previews.preview.mockResolvedValue({});

        await post('/spending/imports/preview', form(Buffer.from('x'), { mapping: MAPPING }));

        expect((previews.preview.mock.calls[0]?.[1] as { mapping: { dateColumn: number } }).mapping.dateColumn).toBe(0);
    });

    it('recusa arquivo ausente, mapping inválido e formato desconhecido com 400', async () => {
        const missing = await post('/spending/imports/preview', form(null));
        const badJson = await post('/spending/imports/preview', form(Buffer.from('x'), { mapping: '{nope' }));
        const badShape = await post('/spending/imports/preview', form(Buffer.from('x'), { mapping: '{"hasHeader":true}' }));
        const badFormat = await post('/spending/imports/preview', form(Buffer.from('x'), { format: 'pdf' }));

        expect([missing.status, badJson.status, badShape.status, badFormat.status]).toEqual([400, 400, 400, 400]);
        expect(missing.body['type']).toBe('imports.file_required');
        expect(badJson.body['type']).toBe('validation_failed');
        expect(previews.preview).not.toHaveBeenCalled();
    });

    it('mapping com valor e par débito/crédito ao mesmo tempo é 400', async () => {
        const both = JSON.stringify({ ...JSON.parse(MAPPING), debitColumn: 3, creditColumn: 4 });
        const partial = JSON.stringify({ ...JSON.parse(MAPPING), amountColumn: undefined, debitColumn: 3 });

        const first = await post('/spending/imports/preview', form(Buffer.from('x'), { mapping: both }));
        const second = await post('/spending/imports/preview', form(Buffer.from('x'), { mapping: partial }));

        expect([first.status, second.status]).toEqual([400, 400]);
    });

    it('5 MB + 1 byte é 413 imports.file_too_large e 5 MB exatos passam', async () => {
        previews.preview.mockResolvedValue({});

        const tooBig = await post('/spending/imports/preview', form(Buffer.alloc(5 * 1024 * 1024 + 1, 0x61)));
        const limit = await post('/spending/imports/preview', form(Buffer.alloc(5 * 1024 * 1024, 0x61)));

        expect(tooBig.status).toBe(413);
        expect(tooBig.body['type']).toBe('imports.file_too_large');
        expect(limit.status).toBe(200);
    });

    it('recusa mais de um arquivo e mais de 10 campos', async () => {
        const two: FormData = form(Buffer.from('a'));
        two.append('file', new Blob(['b']), 'outro.ofx');
        const many: FormData = form(
            Buffer.from('a'),
            Object.fromEntries(Array.from({ length: 11 }, (_u, index: number) => [`f${String(index)}`, 'x']))
        );

        expect((await post('/spending/imports/preview', two)).status).toBe(400);
        expect((await post('/spending/imports/preview', many)).status).toBe(400);
    });
});

describe('POST /spending/imports', () => {
    it('responde 201 com uma conta existente', async () => {
        commits.commit.mockResolvedValue({ id: 'i1' });
        const accountId: string = crypto.randomUUID();

        const response = await post('/spending/imports', form(Buffer.from('x'), { format: 'ofx', accountId }));

        expect(response.status).toBe(201);
        expect(commits.commit.mock.calls[0]?.[1]).toMatchObject({ format: 'ofx', accountId });
    });

    it('responde 201 com conta nova', async () => {
        commits.commit.mockResolvedValue({ id: 'i1' });

        const response = await post(
            '/spending/imports',
            form(Buffer.from('x'), {
                format: 'ofx',
                newAccountName: 'Nubank',
                newAccountKind: 'credit_card',
                newAccountInstitution: 'Nubank'
            })
        );

        expect(response.status).toBe(201);
    });

    it('exige exatamente uma forma de escolher a conta, o formato e um id válido', async () => {
        const accountId: string = crypto.randomUUID();
        const both = await post(
            '/spending/imports',
            form(Buffer.from('x'), { format: 'ofx', accountId, newAccountName: 'N', newAccountKind: 'other' })
        );
        const none = await post('/spending/imports', form(Buffer.from('x'), { format: 'ofx' }));
        const half = await post('/spending/imports', form(Buffer.from('x'), { format: 'ofx', newAccountName: 'N' }));
        const noFormat = await post('/spending/imports', form(Buffer.from('x'), { accountId }));
        const badId = await post('/spending/imports', form(Buffer.from('x'), { format: 'ofx', accountId: 'nao-e-uuid' }));
        const institutionWithId = await post(
            '/spending/imports',
            form(Buffer.from('x'), { format: 'ofx', accountId, newAccountInstitution: 'X' })
        );

        expect([both, none, half, noFormat, badId, institutionWithId].map((response) => response.status)).toEqual([
            400, 400, 400, 400, 400, 400
        ]);
        expect(commits.commit).not.toHaveBeenCalled();
    });

    it('5 MB + 1 byte é 413', async () => {
        const response = await post(
            '/spending/imports',
            form(Buffer.alloc(5 * 1024 * 1024 + 1, 0x61), { format: 'ofx', accountId: crypto.randomUUID() })
        );

        expect(response.status).toBe(413);
    });
});

describe('GET e DELETE /spending/imports', () => {
    it('lista com page e pageSize', async () => {
        lists.list.mockResolvedValue({ data: [], pagination: { page: 2, pageSize: 20, totalRecords: 0, totalPages: 0 } });

        const response = await fetch(`${origin}/spending/imports?page=2&pageSize=20`);

        expect(response.status).toBe(200);
        expect(lists.list).toHaveBeenCalledWith(2, 20);
        expect((await fetch(`${origin}/spending/imports?pageSize=500`)).status).toBe(400);
    });

    it('desfaz pelo id e recusa id que não é uuid', async () => {
        lists.undo.mockResolvedValue({ removed: 4 });
        const id: string = crypto.randomUUID();

        const response = await fetch(`${origin}/spending/imports/${id}`, { method: 'DELETE' });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ removed: 4 });
        expect(lists.undo).toHaveBeenCalledWith(id);
        expect((await fetch(`${origin}/spending/imports/abc`, { method: 'DELETE' })).status).toBe(400);
    });
});
