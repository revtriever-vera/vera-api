import { describe, expect, it, vi } from 'vitest';
import { parseMarketDocumentsConfig } from '../config/market-documents.config';
import { blankPdf, pdfOfText } from '../drivers/fixtures/document-pdf';
import { MarketDocumentTextService } from './market-document-text.service';

const URL_OK: string = 'https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?numSequencia=1';

function serviceWith(getBytes: ReturnType<typeof vi.fn>, env: Record<string, string> = {}): MarketDocumentTextService {
    return new MarketDocumentTextService(parseMarketDocumentsConfig({ MARKET_DOC_REQUEST_SPACING_MS: '0', ...env }), { getBytes } as never);
}

describe('MarketDocumentTextService', () => {
    it('reads the text of a PDF and hashes it', async () => {
        const getBytes: ReturnType<typeof vi.fn> = vi
            .fn()
            .mockResolvedValue(await pdfOfText('FATO RELEVANTE\nA Companhia comunica ao mercado'));

        const outcome = await serviceWith(getBytes).read(URL_OK);

        expect(outcome).toMatchObject({ kind: 'text', text: expect.stringContaining('A Companhia comunica ao mercado') as string });
        expect(outcome.kind === 'text' ? outcome.textHash : '').toMatch(/^[0-9a-f]{64}$/);
        expect(getBytes).toHaveBeenCalledWith(
            expect.objectContaining({
                url: URL_OK,
                maxBytes: 5_000_000,
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; market-documents)' }
            })
        );
    });

    it('keeps only the start of a document above the character limit', async () => {
        const getBytes: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(await pdfOfText(`${'palavra '.repeat(40)}\nfim do documento`));

        const outcome = await serviceWith(getBytes, { MARKET_DOC_MAX_CHARS: '30' }).read(URL_OK);

        expect(outcome).toMatchObject({ kind: 'text', text: 'palavra palavra palavra palavr' });
    });

    it('skips a scanned document that has no text layer', async () => {
        const getBytes: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(await blankPdf());

        await expect(serviceWith(getBytes).read(URL_OK)).resolves.toEqual({ kind: 'skipped', reason: 'scanned' });
    });

    it('skips a file that is not a PDF', async () => {
        const getBytes: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(new TextEncoder().encode('<html>erro</html>'));

        await expect(serviceWith(getBytes).read(URL_OK)).resolves.toEqual({ kind: 'skipped', reason: 'not_pdf' });
    });

    it('skips a PDF that cannot be parsed', async () => {
        const getBytes: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(new TextEncoder().encode('%PDF-1.4 truncado'));

        await expect(serviceWith(getBytes).read(URL_OK)).resolves.toEqual({ kind: 'skipped', reason: 'scanned' });
    });

    it('skips a document above the size limit', async () => {
        const oversize: Error = Object.assign(new Error('market-data.provider_format_invalid'), { name: 'ProviderError' });
        const getBytes: ReturnType<typeof vi.fn> = vi.fn().mockRejectedValue(oversize);

        await expect(serviceWith(getBytes).read(URL_OK)).resolves.toEqual({ kind: 'skipped', reason: 'too_large' });
    });

    it.each(['http://www.rad.cvm.gov.br/doc', 'https://evil.example.com/doc.pdf', 'not a url'])(
        'does not download %s',
        async (url: string) => {
            const getBytes: ReturnType<typeof vi.fn> = vi.fn();

            await expect(serviceWith(getBytes).read(url)).resolves.toEqual({ kind: 'skipped', reason: 'untrusted_url' });
            expect(getBytes).not.toHaveBeenCalled();
        }
    );

    it('lets a transient download failure reach the caller', async () => {
        const getBytes: ReturnType<typeof vi.fn> = vi.fn().mockRejectedValue(new Error('timeout'));

        await expect(serviceWith(getBytes).read(URL_OK)).rejects.toThrow('timeout');
    });

    it('waits between downloads to respect the portal pace', async () => {
        const getBytes: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(await blankPdf());
        const service: MarketDocumentTextService = serviceWith(getBytes, { MARKET_DOC_REQUEST_SPACING_MS: '60' });

        await service.read(URL_OK);
        const startedAt: number = Date.now();
        await service.read(URL_OK);

        expect(Date.now() - startedAt).toBeGreaterThanOrEqual(40);
    });
});
