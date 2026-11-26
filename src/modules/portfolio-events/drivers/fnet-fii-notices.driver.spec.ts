import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parsePortfolioEventsConfig } from '../config/portfolio-events.config';
import { ProviderHttpService } from '../../market-data/services/provider-http.service';
import { FnetFiiNoticesDriver } from './fnet-fii-notices.driver';

const SAMPLE: string = readFileSync(join(__dirname, 'fixtures', 'fnet-aviso-estruturado-sample.xml'), 'utf8');
const CORRECTED: string = SAMPLE.replace('1,10', '1,12');
const encode = (xml: string): string => Buffer.from(xml, 'utf8').toString('base64');
const LINK = { assetId: 'asset-1', issuerKind: 'fund', cnpj: '11728688000147' } as const;

function driverWith(responses: Record<string, unknown>): { driver: FnetFiiNoticesDriver; getJson: ReturnType<typeof vi.fn> } {
    const getJson: ReturnType<typeof vi.fn> = vi.fn(({ url }: { url: string }): Promise<unknown> => {
        const key: string = Object.keys(responses).find((candidate: string): boolean => url.includes(candidate)) ?? '';
        return Promise.resolve(responses[key]);
    });
    const config = parsePortfolioEventsConfig({ PORTFOLIO_EVENTS_REQUEST_SPACING_MS: '0' });
    return { driver: new FnetFiiNoticesDriver(config, { getJson } as unknown as ProviderHttpService), getJson };
}

describe('FnetFiiNoticesDriver', () => {
    it('handles only fund links', () => {
        const { driver } = driverWith({});

        expect(driver.handles(LINK)).toBe(true);
        expect(driver.handles({ ...LINK, issuerKind: 'company' })).toBe(false);
    });

    it('a rectified notice updates the event instead of creating another one', async () => {
        const { driver } = driverWith({
            pesquisarGerenciadorDocumentosDados: {
                data: [
                    { id: 10, versao: 0, status: 'IC', tipoDocumento: 'Aviso aos Cotistas - Estruturado' },
                    { id: 11, versao: 1, status: 'AC', tipoDocumento: 'Aviso aos Cotistas - Estruturado' },
                    { id: 9, versao: 0, status: 'AC', tipoDocumento: 'Aviso aos Cotistas - Estruturado' },
                    { id: 12, versao: 0, status: 'AC', tipoDocumento: 'Relatório Gerencial' }
                ]
            },
            'downloadDocumento?id=9': encode(SAMPLE),
            'downloadDocumento?id=11': encode(CORRECTED)
        });

        const drafts = await driver.fetchFor(LINK);

        expect(drafts.map((draft) => [draft.kind, draft.amountPerUnit])).toEqual([
            ['fii_income', '1.12'],
            ['amortization', '0.25']
        ]);
        expect(drafts[0]?.documentUrl).toContain('id=11');
    });

    it('sends a generic user agent and never asks about other funds', async () => {
        const { driver, getJson } = driverWith({ pesquisarGerenciadorDocumentosDados: { data: [] } });

        await driver.fetchFor(LINK);

        expect(getJson).toHaveBeenCalledTimes(1);
        const request = getJson.mock.calls[0]?.[0] as { url: string; headers: Record<string, string> };
        expect(request.url).toContain('cnpjFundo=11728688000147');
        expect(request.headers['User-Agent']).toBe('Mozilla/5.0 (compatible; portfolio-events)');
    });

    it('fails when the list does not match the schema', async () => {
        const { driver } = driverWith({ pesquisarGerenciadorDocumentosDados: { unexpected: true } });

        await expect(driver.fetchFor(LINK)).rejects.toThrow();
    });
});
