import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IpeDocument } from '../../catalog/services/cvm-ipe-reader.service';
import { parseMarketDocumentsConfig } from '../config/market-documents.config';
import { DocumentIssuer } from '../domain/market-documents.types';
import { CvmIpeDocumentsDriver } from './cvm-ipe-documents.driver';

const ISSUER: DocumentIssuer = { cnpj: '01083200000118', issuerKind: 'company', assetIds: ['asset-1'] };

function document(sequence: number, overrides: Partial<IpeDocument> = {}): IpeDocument {
    return {
        cnpj: ISSUER.cnpj,
        category: 'Fato Relevante',
        type: '',
        species: '',
        subject: 'Remuneração complementar aos acionistas',
        referenceDate: '2026-11-20',
        deliveryDate: '2026-11-20',
        version: 1,
        sequence,
        url: `https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?numSequencia=${String(sequence)}`,
        ...overrides
    };
}

function driverWith(documents: readonly IpeDocument[]): { driver: CvmIpeDocumentsDriver; read: ReturnType<typeof vi.fn> } {
    const read: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(documents);
    const driver: CvmIpeDocumentsDriver = new CvmIpeDocumentsDriver(parseMarketDocumentsConfig({}), { documents: read } as never);
    return { driver, read };
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-25T15:00:00Z'));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('CvmIpeDocumentsDriver', () => {
    it('handles only company issuers', () => {
        const { driver } = driverWith([]);

        expect(driver.handles(ISSUER)).toBe(true);
        expect(driver.handles({ ...ISSUER, issuerKind: 'fund' })).toBe(false);
    });

    it('turns relevant facts, market communications and shareholder notices into pending documents', async () => {
        const { driver } = driverWith([
            document(10),
            document(11, { category: 'Comunicado ao Mercado', subject: '', type: 'Outros Comunicados' }),
            document(12, { category: 'Aviso aos Acionistas', subject: 'Dividendos' })
        ]);

        const drafts = await driver.fetchFor(ISSUER);

        expect(drafts).toEqual([
            {
                externalId: '10:1',
                category: 'relevant_fact',
                title: 'Remuneração complementar aos acionistas',
                publishedAt: '2026-11-20T12:00:00Z',
                url: 'https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?numSequencia=10',
                status: 'pending',
                skipReason: null
            },
            expect.objectContaining({ externalId: '11:1', category: 'market_notice', title: 'Outros Comunicados', status: 'pending' }),
            expect.objectContaining({ externalId: '12:1', category: 'shareholder_notice', title: 'Dividendos', status: 'pending' })
        ]);
    });

    it('registers a routine category as skipped without reading it', async () => {
        const { driver } = driverWith([
            document(20, { category: 'Valores Mobiliários negociados e detidos (art. 11 da Instr. CVM nº 358)', subject: '' })
        ]);

        const drafts = await driver.fetchFor(ISSUER);

        expect(drafts).toEqual([expect.objectContaining({ category: 'routine', status: 'skipped', skipReason: 'routine_category' })]);
    });

    it('ignores other categories, other issuers and deliveries before the window', async () => {
        const { driver, read } = driverWith([
            document(30, { category: 'Reunião da Administração' }),
            document(31, { cnpj: '43776517000180' }),
            document(32, { deliveryDate: '2026-11-01' })
        ]);

        await expect(driver.fetchFor(ISSUER)).resolves.toEqual([]);
        expect(read).toHaveBeenCalledWith({ today: '2026-11-25', deliveredSince: '2026-11-18' });
    });

    it('lets a source failure reach the caller', async () => {
        const failing: CvmIpeDocumentsDriver = new CvmIpeDocumentsDriver(parseMarketDocumentsConfig({}), {
            documents: vi.fn().mockRejectedValue(new Error('down'))
        } as never);

        await expect(failing.fetchFor(ISSUER)).rejects.toThrow('down');
    });
});
