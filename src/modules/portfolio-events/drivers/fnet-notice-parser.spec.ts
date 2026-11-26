import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FnetListItem } from '../validation/fnet.schemas';
import { decodeDocument, isStructuredActiveNotice, parseNoticeDocument } from './fnet-notice-parser';

const SAMPLE: string = readFileSync(join(__dirname, 'fixtures', 'fnet-aviso-estruturado-sample.xml'), 'utf8');
const CNPJ: string = '11728688000147';
const URL: string = 'https://example.com/doc';

describe('parseNoticeDocument', () => {
    it('reads income and amortization with data-com, payment date and value per share', () => {
        expect(parseNoticeDocument(SAMPLE, CNPJ, URL)).toEqual([
            {
                kind: 'fii_income',
                exDate: '2026-10-30',
                paymentDate: '2026-11-14',
                eventDate: null,
                amountPerUnit: '1.10',
                currency: 'BRL',
                externalKey: `${CNPJ}:fii_income:2026-10-30`,
                documentUrl: URL
            },
            {
                kind: 'amortization',
                exDate: '2026-10-30',
                paymentDate: '2026-11-14',
                eventDate: null,
                amountPerUnit: '0.25',
                currency: 'BRL',
                externalKey: `${CNPJ}:amortization:2026-10-30`,
                documentUrl: URL
            }
        ]);
    });

    it('accepts dd/mm/yyyy dates and skips a block with an invalid value', () => {
        const xml: string = `<Provento><TipoProvento>Rendimento</TipoProvento><DataBase>30/10/2026</DataBase><ValorProventoCota>1,5</ValorProventoCota></Provento>
            <Provento><TipoProvento>Rendimento</TipoProvento><DataBase>30/11/2026</DataBase><ValorProventoCota>abc</ValorProventoCota></Provento>`;

        const drafts = parseNoticeDocument(xml, CNPJ, URL);

        expect(drafts).toHaveLength(1);
        expect(drafts[0]).toMatchObject({ exDate: '2026-10-30', paymentDate: null, amountPerUnit: '1.5' });
    });

    it('returns nothing for a document without proventos', () => {
        expect(parseNoticeDocument('<DadosEconomicoFinanceiros/>', CNPJ, URL)).toEqual([]);
    });

    it('decodes a base64 document', () => {
        expect(decodeDocument(Buffer.from(SAMPLE, 'utf8').toString('base64'))).toBe(SAMPLE);
    });
});

describe('isStructuredActiveNotice', () => {
    const item = (overrides: Partial<FnetListItem>): FnetListItem => ({
        id: 1,
        versao: 0,
        status: 'AC',
        tipoDocumento: 'Aviso aos Cotistas - Estruturado',
        ...overrides
    });

    it('keeps only the active structured notice to shareholders', () => {
        expect(isStructuredActiveNotice(item({}))).toBe(true);
        expect(isStructuredActiveNotice(item({ status: 'IC' }))).toBe(false);
        expect(isStructuredActiveNotice(item({ tipoDocumento: 'Relatório Gerencial' }))).toBe(false);
        expect(isStructuredActiveNotice(item({ tipoDocumento: 'Aviso aos Cotistas' }))).toBe(false);
    });
});
