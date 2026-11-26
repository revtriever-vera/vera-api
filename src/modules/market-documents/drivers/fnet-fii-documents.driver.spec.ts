import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseMarketDocumentsConfig } from '../config/market-documents.config';
import { DocumentIssuer } from '../domain/market-documents.types';
import { FnetFiiDocumentsDriver } from './fnet-fii-documents.driver';

const FUND: DocumentIssuer = { cnpj: '11728688000147', issuerKind: 'fund', assetIds: ['asset-1'] };

function item(id: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id,
        versao: 1,
        status: 'AC',
        tipoDocumento: 'Informe Mensal Estruturado',
        categoriaDocumento: 'Informes Periódicos',
        dataEntrega: '12/11/2026 09:30',
        ...overrides
    };
}

function driverWith(data: unknown): { driver: FnetFiiDocumentsDriver; getJson: ReturnType<typeof vi.fn> } {
    const getJson: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(data);
    const config = parseMarketDocumentsConfig({
        MARKET_DOC_REQUEST_SPACING_MS: '0',
        MARKET_DOC_FNET_BASE_URL: 'https://fnet.example/publico'
    });
    return { driver: new FnetFiiDocumentsDriver(config, { getJson } as never), getJson };
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-25T15:00:00Z'));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('FnetFiiDocumentsDriver', () => {
    it('handles only fund issuers', () => {
        const { driver } = driverWith({ data: [] });

        expect(driver.handles(FUND)).toBe(true);
        expect(driver.handles({ ...FUND, issuerKind: 'company' })).toBe(false);
    });

    it('registers the monthly report, the management report and the relevant fact as link-only documents', async () => {
        const { driver, getJson } = driverWith({
            data: [
                item(1),
                item(2, { tipoDocumento: 'Relatório Gerencial', categoriaDocumento: 'Relatórios' }),
                item(3, { tipoDocumento: 'Fato Relevante', categoriaDocumento: 'Fato Relevante' })
            ]
        });

        const drafts = await driver.fetchFor(FUND);

        expect(drafts).toEqual([
            {
                externalId: '1',
                category: 'monthly_report',
                title: 'Informe Mensal Estruturado',
                publishedAt: '2026-11-12T09:30:00-03:00',
                url: 'https://fnet.example/publico/exibirDocumento?id=1&cvm=true',
                status: 'skipped',
                skipReason: 'link_only'
            },
            expect.objectContaining({ externalId: '2', category: 'management_report' }),
            expect.objectContaining({ externalId: '3', category: 'relevant_fact' })
        ]);
        const url: string = (getJson.mock.calls[0] as [{ url: string }])[0].url;
        expect(url).toContain('cnpjFundo=11728688000147');
        expect(url).toContain('dataInicial=18%2F11%2F2026');
    });

    it('drops inactive versions, other document types and entries without a delivery date', async () => {
        const { driver } = driverWith({
            data: [
                item(4, { status: 'IA' }),
                item(5, { tipoDocumento: 'Aviso aos Cotistas', categoriaDocumento: 'Avisos' }),
                item(6, { dataEntrega: '' })
            ]
        });

        await expect(driver.fetchFor(FUND)).resolves.toEqual([]);
    });

    it('rejects a list that does not have the expected shape', async () => {
        const { driver } = driverWith({ rows: [] });

        await expect(driver.fetchFor(FUND)).rejects.toThrow();
    });

    it('uses the category as title when the type is empty', async () => {
        const { driver } = driverWith({ data: [item(7, { tipoDocumento: '', categoriaDocumento: 'Informe Mensal' })] });

        const drafts = await driver.fetchFor(FUND);

        expect(drafts[0]).toMatchObject({ title: 'Informe Mensal' });
    });
});
