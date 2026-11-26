import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IpeDocument } from '../../catalog/services/cvm-ipe-reader.service';
import { parsePortfolioEventsConfig } from '../config/portfolio-events.config';
import { CvmIpeDriver } from './cvm-ipe.driver';
import { pdfOfText } from './fixtures/notice-pdf';

const COMPANY = { assetId: 'asset-1', issuerKind: 'company', cnpj: '01083200000118' } as const;
const OTHER_CNPJ: string = '43776517000180';

function text(name: string): string {
    return readFileSync(join(__dirname, 'fixtures', 'cvm-ipe', `${name}.txt`), 'utf8');
}

function document(sequence: number, overrides: Partial<IpeDocument> = {}): IpeDocument {
    return {
        cnpj: COMPANY.cnpj,
        category: 'Aviso aos Acionistas',
        type: 'Outros avisos',
        species: '',
        subject: 'Dividendos/Juros sobre Capital Próprio',
        referenceDate: '2026-11-20',
        deliveryDate: '2026-11-20',
        version: 1,
        sequence,
        url: `https://www.rad.cvm.gov.br/ENET/frmDownloadDocumento.aspx?numSequencia=${String(sequence)}`,
        ...overrides
    };
}

interface Rig {
    readonly driver: CvmIpeDriver;
    readonly getBytes: ReturnType<typeof vi.fn>;
    readonly documents: ReturnType<typeof vi.fn>;
    readonly metrics: { unparsed: ReturnType<typeof vi.fn>; sourceFailed: ReturnType<typeof vi.fn> };
}

async function rigWith(documents: readonly IpeDocument[], pdfs: Readonly<Record<number, string | Uint8Array | Error>>): Promise<Rig> {
    const bodies: Map<string, Uint8Array | Error> = new Map<string, Uint8Array | Error>();
    for (const [sequence, content] of Object.entries(pdfs)) {
        const url: string = document(Number(sequence)).url;
        bodies.set(url, typeof content === 'string' ? await pdfOfText(content) : content);
    }
    const getBytes: ReturnType<typeof vi.fn> = vi.fn(({ url }: { url: string }): Promise<Uint8Array> => {
        const body: Uint8Array | Error | undefined = bodies.get(url);
        return body instanceof Error || body === undefined ? Promise.reject(body ?? new Error('missing')) : Promise.resolve(body);
    });
    const documentsMock: ReturnType<typeof vi.fn> = vi.fn((): Promise<readonly IpeDocument[]> => Promise.resolve(documents));
    const metrics = { unparsed: vi.fn(), sourceFailed: vi.fn() };
    const config = parsePortfolioEventsConfig({ PORTFOLIO_EVENTS_CVM_REQUEST_SPACING_MS: '0' });
    const driver: CvmIpeDriver = new CvmIpeDriver(config, { documents: documentsMock } as never, { getBytes } as never, metrics as never);
    return { driver, getBytes, documents: documentsMock, metrics };
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-25T15:00:00Z'));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('CvmIpeDriver', () => {
    it('handles only company links', async () => {
        const { driver } = await rigWith([], {});

        expect(driver.handles(COMPANY)).toBe(true);
        expect(driver.handles({ ...COMPANY, issuerKind: 'fund' })).toBe(false);
    });

    it('reads a dividend notice and an assembly date, and keeps the aviso and the comunicado as one event', async () => {
        const notice: string = text('aviso-neoenergia-dividendos');
        const { driver } = await rigWith(
            [
                document(10),
                document(11, { category: 'Comunicado ao Mercado', subject: 'Dividendos intermediários', deliveryDate: '2026-11-21' }),
                document(12, {
                    category: 'Assembleia',
                    type: 'AGE',
                    species: 'Edital de Convocação',
                    subject: 'Eleição',
                    referenceDate: '2026-12-15'
                }),
                document(13, { type: 'Data prevista para a assembleia', subject: 'AGE', referenceDate: '2026-12-15' })
            ],
            { 10: notice, 11: notice }
        );

        const drafts = await driver.fetchFor(COMPANY);

        expect(drafts).toEqual([
            {
                kind: 'dividend',
                exDate: '2025-12-30',
                paymentDate: '2026-02-09',
                eventDate: null,
                amountPerUnit: '0.8106790501',
                currency: 'BRL',
                externalKey: '01083200000118:dividend:2025-12-30',
                documentUrl: document(11).url
            },
            {
                kind: 'assembly',
                exDate: null,
                paymentDate: null,
                eventDate: '2026-12-15',
                amountPerUnit: null,
                currency: 'BRL',
                externalKey: '01083200000118:assembly:2026-12-15',
                documentUrl: document(13).url
            }
        ]);
    });

    it('reads a JCP and a dividend of two different formats', async () => {
        const { driver } = await rigWith([document(20), document(21)], {
            20: text('aviso-unifique-jcp'),
            21: text('aviso-irani-dividendos')
        });

        const drafts = await driver.fetchFor(COMPANY);

        expect(drafts.map((draft) => [draft.kind, draft.exDate, draft.paymentDate, draft.amountPerUnit])).toEqual([
            ['jcp', '2026-07-24', '2026-08-05', '0.077032959'],
            ['dividend', '2026-08-07', '2026-08-20', '0.034404313']
        ]);
    });

    it('a rectification replaces the value of the original notice instead of creating another event', async () => {
        const rectification: string = text('aviso-sabesp-retificacao-jcp');
        const original: string = rectification.replace('2,643892990', '2,63053993');
        const { driver } = await rigWith(
            [document(31, { deliveryDate: '2026-11-12', version: 4 }), document(30, { deliveryDate: '2026-11-10', version: 1 })],
            { 30: original, 31: rectification }
        );

        const drafts = await driver.fetchFor(COMPANY);

        expect(drafts.map((draft) => [draft.kind, draft.amountPerUnit, draft.documentUrl])).toEqual([
            ['jcp', '2.643892990', document(31).url]
        ]);
    });

    it('an unreadable notice does not become an event and is counted, and the readable ones stay', async () => {
        const { driver, metrics } = await rigWith([document(40), document(41), document(42)], {
            40: text('aviso-ceb-destinacao-sem-data-com'),
            41: new Uint8Array([1, 2, 3]),
            42: text('aviso-unifique-jcp')
        });

        const drafts = await driver.fetchFor(COMPANY);

        expect(drafts.map((draft) => draft.kind)).toEqual(['jcp']);
        expect(metrics.unparsed).toHaveBeenCalledWith('cvm_ipe', 2);
    });

    it('a document that fails to download is counted and the others go on', async () => {
        const { driver, metrics } = await rigWith([document(50), document(51)], {
            50: new Error('down'),
            51: text('aviso-unifique-jcp')
        });

        const drafts = await driver.fetchFor(COMPANY);

        expect(drafts).toHaveLength(1);
        expect(metrics.sourceFailed).toHaveBeenCalledWith('cvm_ipe', 'document_unreadable');
    });

    it('propagates the source error when the IPE list is out of the air', async () => {
        const { driver, documents } = await rigWith([], {});
        documents.mockRejectedValue(Object.assign(new Error('catalog.source_unavailable'), { name: 'CatalogSourceError' }));

        await expect(driver.fetchFor(COMPANY)).rejects.toMatchObject({ name: 'CatalogSourceError' });
    });

    it('never downloads the documents of another company, nor outside the CVM host', async () => {
        const { driver, getBytes } = await rigWith(
            [
                document(60, { cnpj: OTHER_CNPJ }),
                document(61, { url: 'https://evil.example/doc.pdf' }),
                document(62, { subject: 'Fato qualquer' })
            ],
            {}
        );

        await expect(driver.fetchFor(COMPANY)).resolves.toEqual([]);
        expect(getBytes).not.toHaveBeenCalled();
    });

    it('ignores assembly dates older than the window and notices delivered before it', async () => {
        const { driver, getBytes } = await rigWith(
            [
                document(70, { category: 'Assembleia', type: 'AGO', species: 'Edital de Convocação', referenceDate: '2026-04-30' }),
                document(71, { deliveryDate: '2026-08-01' })
            ],
            {}
        );

        await expect(driver.fetchFor(COMPANY)).resolves.toEqual([]);
        expect(getBytes).not.toHaveBeenCalled();
    });
});
