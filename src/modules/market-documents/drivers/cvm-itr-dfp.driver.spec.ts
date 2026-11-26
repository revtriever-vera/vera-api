import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PeriodicDocument, PeriodicKind } from '../../catalog/services/cvm-periodic-reader.service';
import { parseMarketDocumentsConfig } from '../config/market-documents.config';
import { DocumentIssuer } from '../domain/market-documents.types';
import { CvmItrDfpDriver } from './cvm-itr-dfp.driver';

const ISSUER: DocumentIssuer = { cnpj: '01083200000118', issuerKind: 'company', assetIds: ['asset-1'] };

function delivery(kind: PeriodicKind, documentId: string, cnpj: string = ISSUER.cnpj): PeriodicDocument {
    return {
        cnpj,
        kind,
        referenceDate: '2026-09-30',
        deliveryDate: '2026-11-20',
        version: 1,
        documentId,
        url: `http://www.rad.cvm.gov.br/ENETCONSULTA/frmDownloadDocumento.aspx?NumeroSequencialDocumento=${documentId}`
    };
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-25T15:00:00Z'));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('CvmItrDfpDriver', () => {
    it('handles only company issuers', () => {
        const driver: CvmItrDfpDriver = new CvmItrDfpDriver(parseMarketDocumentsConfig({}), { documents: vi.fn() } as never);

        expect(driver.handles(ISSUER)).toBe(true);
        expect(driver.handles({ ...ISSUER, issuerKind: 'fund' })).toBe(false);
    });

    it('registers quarterly and annual deliveries of the issuer as skipped, with no package to read', async () => {
        const documents: ReturnType<typeof vi.fn> = vi.fn((kind: PeriodicKind): Promise<PeriodicDocument[]> =>
            Promise.resolve(kind === 'ITR' ? [delivery('ITR', '1'), delivery('ITR', '2', '43776517000180')] : [delivery('DFP', '3')])
        );
        const driver: CvmItrDfpDriver = new CvmItrDfpDriver(parseMarketDocumentsConfig({}), { documents } as never);

        const drafts = await driver.fetchFor(ISSUER);

        expect(drafts).toEqual([
            expect.objectContaining({
                externalId: 'ITR:1',
                category: 'quarterly_results',
                title: 'ITR 2026-09-30',
                publishedAt: '2026-11-20T12:00:00Z',
                status: 'skipped',
                skipReason: 'financial_package'
            }),
            expect.objectContaining({ externalId: 'DFP:3', category: 'annual_results', title: 'DFP 2026-09-30' })
        ]);
        expect(documents).toHaveBeenCalledWith('DFP', { today: '2026-11-25', deliveredSince: '2026-11-18' });
    });
});
