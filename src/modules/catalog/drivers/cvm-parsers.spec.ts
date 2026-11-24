import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SourceAsset } from '../ports/asset-source.port';
import {
    etfAssets,
    FIAGRO_INFORME_COLUMNS,
    FII_INFORME_COLUMNS,
    FundClass,
    parseDepositaryReceipts,
    parseFundClasses,
    parseFundInforme,
    parseListedCompanies,
    tickerOfFundIsin
} from './cvm-parsers';

function fixture(name: string): string {
    return readFileSync(join(__dirname, 'fixtures', 'cvm', name), 'utf-8');
}

function bySymbol(assets: readonly SourceAsset[]): Record<string, SourceAsset | undefined> {
    return Object.fromEntries(assets.map((asset: SourceAsset): [string, SourceAsset] => [asset.symbol, asset]));
}

function thrown(action: () => unknown): unknown {
    try {
        action();
    } catch (error: unknown) {
        return error;
    }
    return null;
}

const CLASSES: ReadonlyMap<string, FundClass> = parseFundClasses(fixture('registro-classe-sample.csv'));

describe('parseListedCompanies', () => {
    const assets: SourceAsset[] = parseListedCompanies([
        fixture('fca-valor-mobiliario-2026-sample.csv'),
        fixture('fca-valor-mobiliario-2025-sample.csv')
    ]);
    const symbols: Record<string, SourceAsset | undefined> = bySymbol(assets);

    it('keeps shares, units and sponsored BDRs traded on a listed market', () => {
        expect(symbols['ITUB3']).toMatchObject({ kind: 'stock', currency: 'BRL', externalId: 'ITUB3' });
        expect(symbols['ITUB4']?.kind).toBe('stock');
        expect(symbols['TAEE11']?.kind).toBe('stock');
        expect(symbols['INBR32']?.kind).toBe('bdr');
    });

    it('drops debentures, codes that are not tickers, over-the-counter securities and securities no longer traded', () => {
        expect(assets.map((asset: SourceAsset) => asset.symbol).sort()).toEqual(['INBR32', 'ITUB3', 'ITUB4', 'PETR4', 'TAEE11']);
    });

    it('takes the issuer name and CNPJ from the newest version of the document, once per ticker', () => {
        expect(assets.filter((asset: SourceAsset) => asset.symbol === 'PETR4')).toHaveLength(1);
        expect(symbols['PETR4']).toMatchObject({ name: 'PETROLEO BRASILEIRO S.A. PETROBRAS', raw: { cnpj: '33000167000101' } });
    });

    it('lets a newer version without a ticker remove it', () => {
        const header: string =
            'CNPJ_Companhia;Data_Referencia;Versao;ID_Documento;Nome_Empresarial;Valor_Mobiliario;Codigo_Negociacao;Mercado;Data_Fim_Negociacao';
        const older: string = `${header}\n11.111.111/0001-11;2025-01-01;1;1;ACME S.A.;Ações Ordinárias;ACME3;Bolsa;\n11.111.111/0001-11;2025-01-01;1;1;ACME S.A.;Ações Preferenciais;ACME4;Bolsa;`;
        const newer: string = `${header}\n11.111.111/0001-11;2026-01-01;1;2;ACME S.A.;Ações Ordinárias;ACME3;Bolsa;`;

        expect(parseListedCompanies([older, newer]).map((asset: SourceAsset) => asset.symbol)).toEqual(['ACME3']);
    });

    it('rejects a file without the expected columns', () => {
        expect(thrown(() => parseListedCompanies(['A;B\n1;2']))).toMatchObject({ errorCode: 'catalog.source_format_invalid' });
    });
});

describe('parseFundClasses', () => {
    it('keeps only the classes that map to a catalog kind and flags the active ones', () => {
        expect(CLASSES.size).toBe(9);
        expect(CLASSES.get('11728688000147')).toMatchObject({ kind: 'fii', active: true });
        expect(CLASSES.get('13555918000149')).toMatchObject({ kind: 'fii', active: false });
        expect(CLASSES.get('41745701000137')?.kind).toBe('fii');
        expect(CLASSES.get('10406511000161')?.kind).toBe('etf');
        expect(CLASSES.get('69711971000146')?.active).toBe(false);
        expect(CLASSES.get('00017024000153')).toBeUndefined();
    });
});

describe('tickerOfFundIsin', () => {
    it('derives the quota ticker from the issuer code of a fund ISIN', () => {
        expect(tickerOfFundIsin('BRHGLGCTF004')).toBe('HGLG11');
        expect(tickerOfFundIsin('brfvpqctf015')).toBe('FVPQ11');
    });

    it('returns null for anything that is not a fund quota ISIN', () => {
        expect(tickerOfFundIsin('')).toBeNull();
        expect(tickerOfFundIsin('BRITUBACNPR5')).toBeNull();
    });
});

describe('parseFundInforme', () => {
    it('lists real estate funds that are active in the registry and traded on the exchange, once, from their newest informe', () => {
        const assets: SourceAsset[] = parseFundInforme([fixture('inf-mensal-fii-geral-sample.csv')], FII_INFORME_COLUMNS, CLASSES);

        expect(assets.map((asset: SourceAsset) => asset.symbol).sort()).toEqual(['FVPQ11', 'HGLG11']);
        expect(bySymbol(assets)['FVPQ11']).toMatchObject({
            kind: 'fii',
            currency: 'BRL',
            name: 'VIA PARQUE SHOPPING FII',
            raw: { cnpj: '00332266000131' }
        });
    });

    it('reads the agribusiness funds with their own columns', () => {
        const assets: SourceAsset[] = parseFundInforme([fixture('inf-mensal-fiagro-sample.csv')], FIAGRO_INFORME_COLUMNS, CLASSES);

        expect(assets).toHaveLength(1);
        expect(assets[0]).toMatchObject({ symbol: 'KNCA11', kind: 'fii' });
    });
});

describe('etfAssets', () => {
    it('lists the curated ETFs whose CNPJ is an active index fund class and takes the name from the registry', () => {
        const assets: SourceAsset[] = etfAssets(
            [
                { symbol: 'BOVA11', cnpj: '10406511000161' },
                { symbol: 'LFTB11', cnpj: '69711971000146' },
                { symbol: 'HGLG11', cnpj: '11728688000147' },
                { symbol: 'NOPE11', cnpj: '99999999999999' }
            ],
            CLASSES
        );

        expect(assets).toEqual([
            {
                externalId: 'BOVA11',
                symbol: 'BOVA11',
                name: 'ISHARES IBOVESPA CLASSE DE ÍNDICE',
                kind: 'etf',
                currency: 'BRL',
                raw: { cnpj: '10406511000161' }
            }
        ]);
    });
});

describe('parseDepositaryReceipts', () => {
    it('lists unsponsored BDRs and units held by funds and ignores other securities', () => {
        const assets: SourceAsset[] = parseDepositaryReceipts(fixture('cda-blc4-sample.csv'));
        const symbols: Record<string, SourceAsset | undefined> = bySymbol(assets);

        expect(symbols['AAPL34']).toMatchObject({ kind: 'bdr', name: 'APPLE DRN ED', raw: { isin: 'BRAAPLBDR004' } });
        expect(symbols['BPAC11']?.kind).toBe('stock');
        expect(assets.every((asset: SourceAsset) => asset.kind === 'bdr' || asset.kind === 'stock')).toBe(true);
        expect(symbols['CSAN33']).toBeUndefined();
    });
});
