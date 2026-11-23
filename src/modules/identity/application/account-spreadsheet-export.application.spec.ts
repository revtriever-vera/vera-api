import { Workbook, Worksheet } from 'exceljs';
import JSZip from 'jszip';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { AlsAppContext } from '../../../core/context/als-app-context';
import { UnauthorizedError } from '../domain/identity.errors';
import { SpreadsheetSheet } from '../services/account-spreadsheet-exporter.port';
import { AccountExportBuilder } from '../services/account-export.builder';
import { AccountSpreadsheetRegistry } from '../services/account-spreadsheet.registry';
import { CompanyTimezoneService } from '../services/company-timezone.service';
import { IdentityLogService } from '../services/identity-log.service';
import { IdentityMetricsService } from '../services/identity-metrics.service';
import { AccountSpreadsheetExportApplication, AccountSpreadsheetExportFile } from './account-spreadsheet-export.application';

function sheetOf(file: string, name: string, rows: (string | number)[][]): SpreadsheetSheet {
    return { file, name, columns: [{ header: 'H', type: 'text', width: 10 }], rows };
}

async function* failing(): AsyncGenerator<(string | number)[]> {
    yield ['antes'];
    await Promise.reject(new Error('boom'));
}

function build(sheets: SpreadsheetSheet[]) {
    const accountSpreadsheetExport = vi.fn();
    const spreadsheetsExported = vi.fn();
    const spreadsheetsFailed = vi.fn();
    const context: AlsAppContext = new AlsAppContext();
    const application: AccountSpreadsheetExportApplication = new AccountSpreadsheetExportApplication(
        { sheets: vi.fn().mockResolvedValue(sheets) } as unknown as AccountSpreadsheetRegistry,
        { build: vi.fn().mockResolvedValue({ format: 'vera-export/1', sections: { assets: [] } }) } as unknown as AccountExportBuilder,
        { todayInCompany: vi.fn().mockResolvedValue('2026-11-22') } as unknown as CompanyTimezoneService,
        { spreadsheetsExported, spreadsheetsFailed } as unknown as IdentityLogService,
        { accountSpreadsheetExport } as unknown as IdentityMetricsService,
        context
    );
    const inRequest = async <T>(fn: () => Promise<T>, withCompany: boolean = true): Promise<T> =>
        context.run({ requestId: 'r', locale: 'pt-BR', ...(withCompany ? { userId: 'u', companyId: 'c' } : {}) }, fn);
    return { application, inRequest, accountSpreadsheetExport, spreadsheetsExported, spreadsheetsFailed };
}

async function bytesOf(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
}

describe('AccountSpreadsheetExportApplication', () => {
    it('zips one workbook per file with the sheets grouped, plus dados.json', async () => {
        const doubles = build([
            sheetOf('metas', 'Classes', [['a']]),
            sheetOf('metas', 'Ativos', [['b'], ['c']]),
            sheetOf('carteira', 'Carteira', [['d']])
        ]);

        const file: AccountSpreadsheetExportFile = await doubles.inRequest(async () => doubles.application.export());
        const zip: JSZip = await JSZip.loadAsync(await bytesOf(file.stream));

        expect(file.filename).toBe('vera-meus-dados-2026-11-22.zip');
        expect(Object.keys(zip.files)).toEqual(['metas.xlsx', 'carteira.xlsx', 'dados.json']);
        const workbook: Workbook = new Workbook();
        await workbook.xlsx.load(
            (await (zip.file('metas.xlsx') as JSZip.JSZipObject).async('nodebuffer')) as unknown as Parameters<Workbook['xlsx']['load']>[0]
        );
        expect(workbook.worksheets.map((sheet: Worksheet) => sheet.name)).toEqual(['Classes', 'Ativos']);
        expect(JSON.parse(await (zip.file('dados.json') as JSZip.JSZipObject).async('string'))).toMatchObject({ format: 'vera-export/1' });
        expect(doubles.accountSpreadsheetExport).toHaveBeenCalledWith('success');
        expect(doubles.spreadsheetsExported).toHaveBeenCalledWith(3, 4, expect.any(Number));
    });

    it('refuses a request without a company', async () => {
        const doubles = build([]);

        await expect(doubles.inRequest(async () => doubles.application.export(), false)).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('counts a failure when an exporter cannot list its sheets', async () => {
        const doubles = build([]);
        const broken = new AccountSpreadsheetExportApplication(
            { sheets: vi.fn().mockRejectedValue(new Error('x')) } as unknown as AccountSpreadsheetRegistry,
            {} as AccountExportBuilder,
            {} as CompanyTimezoneService,
            {} as IdentityLogService,
            { accountSpreadsheetExport: doubles.accountSpreadsheetExport } as unknown as IdentityMetricsService,
            { get: () => ({ companyId: 'c' }) } as unknown as AlsAppContext
        );

        await expect(broken.export()).rejects.toThrow('x');
        expect(doubles.accountSpreadsheetExport).toHaveBeenCalledWith('failed');
    });

    it('fails the stream and logs when a sheet breaks while it is written', async () => {
        const doubles = build([{ file: 'metas', name: 'Classes', columns: [], rows: failing() }]);

        const file: AccountSpreadsheetExportFile = await doubles.inRequest(async () => doubles.application.export());

        await expect(bytesOf(file.stream)).rejects.toThrow('boom');
        expect(doubles.accountSpreadsheetExport).toHaveBeenCalledWith('failed');
        expect(doubles.spreadsheetsFailed).toHaveBeenCalled();
    });
});
