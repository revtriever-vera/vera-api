import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOTE_DOCUMENTS, NoteDocument, totalsOf } from './brokerage-note-data';
import { buildBrokerageNotes, buildNoteCatalogFile, buildNoteEvalCases } from './brokerage-notes';
import { findCpfLikeNumbers, isValidCpf } from './document-validation';

const EVAL_CASES_DIR: string = join(__dirname, '..', '..', '..', '..', 'evals', 'cases');

describe('brokerage note fixtures', () => {
    it('writes one PDF per document, at least five layouts, and the scanned one is an image only', () => {
        const files: Map<string, Buffer> = new Map(buildBrokerageNotes());

        expect(files.size).toBe(NOTE_DOCUMENTS.length);
        expect(new Set(NOTE_DOCUMENTS.map((document: NoteDocument): string => document.layout)).size).toBeGreaterThanOrEqual(5);
        const scanned: Buffer | undefined = files.get('notes/nota-escaneada.pdf');
        expect(scanned?.toString('latin1')).toContain('/Subtype /Image');
        expect(scanned?.toString('latin1')).not.toContain('PETROBRAS');
        expect(files.get('notes/nota-duas-paginas.pdf')?.toString('latin1')).toContain('/Count 2');
        expect(files.get('notes/nota-varias-notas.pdf')?.toString('latin1')).toContain('/Count 2');
    });

    it('every note closes its own arithmetic: net is trades minus costs minus IRRF', () => {
        for (const document of NOTE_DOCUMENTS) {
            for (const note of document.notes) {
                const totals = totalsOf(note);
                const sells: number = note.trades
                    .filter((trade) => trade.side === 'sell')
                    .reduce((sum, trade) => sum + trade.quantity * trade.priceCents, 0);
                const buys: number = totals.volumeCents - sells;
                const costs: number =
                    totals.fees.settlementCents + totals.fees.exchangeCents + totals.fees.brokerageCents + totals.fees.issCents;

                expect(totals.netCents).toBe(sells - buys - costs - totals.fees.irrfCents);
            }
        }
    });

    it('the eval cases and the catalog committed in evals/ are what the generator produces', () => {
        for (const [path, content] of [...buildNoteEvalCases(), buildNoteCatalogFile()]) {
            expect(readFileSync(join(EVAL_CASES_DIR, path)).equals(content)).toBe(true);
        }
    });

    it('no eval case or note carries a CPF with valid check digits, only the invented holder', () => {
        const cases: string = buildNoteEvalCases()
            .map(([, content]: [string, Buffer]): string => content.toString('utf8'))
            .join('\n');
        const notes: string = buildBrokerageNotes()
            .map(([, content]: [string, Buffer]): string => content.toString('latin1'))
            .join('\n');

        expect(findCpfLikeNumbers(`${cases}\n${notes}`).filter(isValidCpf)).toEqual([]);
    });
});
