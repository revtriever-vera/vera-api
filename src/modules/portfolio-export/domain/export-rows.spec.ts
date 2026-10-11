import { describe, expect, it } from 'vitest';
import { EXPORT_LABELS, headerLabelsOf } from './export-labels';
import { buildExportRows } from './export-rows';
import { holdingOf, snapshotOf } from './export-fixtures';

describe('buildExportRows', () => {
    it('builds a stock row with quantity, class, value and source label', () => {
        const [row] = buildExportRows(snapshotOf([holdingOf({})]), 'pt-BR');

        expect(row).toEqual({
            symbol: 'ITUB4',
            name: 'Itaú Unibanco',
            className: 'Ações Brasil',
            quantity: '2000',
            quantityDecimals: 0,
            valueMinor: 7_560_000,
            valueSourceLabel: 'B3 via brapi'
        });
    });

    it('builds a fixed income row without quantity and with the curve source', () => {
        const [row] = buildExportRows(
            snapshotOf([
                holdingOf({
                    symbol: 'CDB Banco',
                    name: 'CDB Banco',
                    classId: 'class-fi',
                    quantity: null,
                    quantityDecimals: null,
                    valueSource: 'curve_cdi'
                })
            ]),
            'pt-BR'
        );

        expect(row).toMatchObject({ quantity: null, className: 'Renda fixa', valueSourceLabel: 'Curva do CDI (BC)' });
    });

    it('keeps the order of the holdings and the class display name given by the snapshot', () => {
        const rows = buildExportRows(
            snapshotOf([holdingOf({ symbol: 'B' }), holdingOf({ symbol: 'A', classId: 'class-fi' }), holdingOf({ symbol: 'C' })]),
            'pt-BR'
        );

        expect(rows.map((row) => row.symbol)).toEqual(['B', 'A', 'C']);
        expect(rows[1]?.className).toBe('Renda fixa');
    });

    it('leaves the class empty for an orphan holding and falls back to the raw source for an unknown one', () => {
        const [row] = buildExportRows(snapshotOf([holdingOf({ classId: null, valueSource: 'mystery' })]), 'en');

        expect(row).toMatchObject({ className: '', valueSourceLabel: 'mystery' });
    });

    it('neutralizes user text that looks like a formula', () => {
        const [row] = buildExportRows(snapshotOf([holdingOf({ symbol: '=1+1', name: '-2 CDB' })]), 'pt-BR');

        expect(row).toMatchObject({ symbol: "'=1+1", name: "'-2 CDB" });
    });

    it('uses the labels of the requested locale', () => {
        const [row] = buildExportRows(snapshotOf([holdingOf({ valueSource: 'tesouro_direto' })]), 'en');

        expect(row?.valueSourceLabel).toBe('Official Treasury price');
    });
});

describe('export labels', () => {
    it('has the same keys in pt-BR and en', () => {
        expect(Object.keys(EXPORT_LABELS.en.headers)).toEqual(Object.keys(EXPORT_LABELS['pt-BR'].headers));
        expect(Object.keys(EXPORT_LABELS.en.sources)).toEqual(Object.keys(EXPORT_LABELS['pt-BR'].sources));
        Object.values(EXPORT_LABELS).forEach((labels) => {
            expect(Object.values(labels.headers).every((text: string) => text.length > 0)).toBe(true);
            expect(Object.values(labels.sources).every((text: string) => text.length > 0)).toBe(true);
        });
    });

    it('puts the base currency in the value header', () => {
        expect(headerLabelsOf('pt-BR', 'BRL')).toEqual(['Ativo', 'Nome', 'Classe', 'Quantidade', 'Valor (BRL)', 'Fonte do valor']);
        expect(headerLabelsOf('en', 'USD')).toEqual(['Asset', 'Name', 'Class', 'Quantity', 'Value (USD)', 'Value source']);
    });
});
