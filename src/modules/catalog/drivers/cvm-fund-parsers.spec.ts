import { describe, expect, it } from 'vitest';
import { fixtureText } from './fixtures/cvm-fixtures';
import {
    FundClassRecord,
    FundSeries,
    fundAsset,
    fundSeries,
    parseActiveSubclasses,
    parseInvestableClasses,
    searchableName
} from './cvm-fund-parsers';
import { decodeCsv } from './cvm-csv';

const CLASSES: string = decodeCsv(fixtureText('fund-registro-classe-sample.csv'));
const SUBCLASSES: string = decodeCsv(fixtureText('fund-registro-subclasse-sample.csv'));

describe('searchableName', () => {
    it.each([
        ['FIF - CLASSE DE INVESTIMENTO   RENDA FIXA EXPONENCIAL - RESP LIMITADA', 'RENDA FIXA EXPONENCIAL'],
        [
            'BB RENDA FIXA AUTOMÁTICO EMPRESA SIMPLES FIC DE FUNDOS DE INVESTIMENTO FINANCEIRO RESP LIMITADA',
            'BB RENDA FIXA AUTOMÁTICO EMPRESA SIMPLES DE FUNDOS DE INVESTIMENTO FINANCEIRO'
        ],
        ['SANTANDER CEDRO RENDA FIXA - FUNDO DE INVESTIMENTO FINANCEIRO RESPONSABILIDADE LIMITADA', 'SANTANDER CEDRO RENDA FIXA'],
        ['ITAÚ MACRO OPPORTUNITIES RENDA FIXA LONGO PRAZO FIF CIC RESP LIMITADA', 'ITAÚ MACRO OPPORTUNITIES RENDA FIXA LONGO PRAZO'],
        ['KAPITALO K10 S FUNDO DE INVESTIMENTO EM COTAS DE FUNDOS DE  INVESTIMENTO MULTIMERCADO', 'KAPITALO K10 S MULTIMERCADO'],
        [
            'RB VITÓRIA FIC DE FUNDOS INCENTIVADO DE INVESTIMENTO FINANCEIRO EM INFRAESTRUTURA RENDA FIXA - RL',
            'RB VITÓRIA DE FUNDOS INCENTIVADO DE INVESTIMENTO FINANCEIRO EM INFRAESTRUTURA RENDA FIXA'
        ],
        ['BTG PACTUAL MULTISTRATEGIES FUNDO DE INVESTIMENTO FINANCEIRO MULTIMERCADO RESP LTDA', 'BTG PACTUAL MULTISTRATEGIES MULTIMERCADO'],
        ['FIFA FIND FICO', 'FIFA FIND FICO'],
        ['  fif  ', 'FIF']
    ])('cleans %s', (full: string, expected: string) => {
        expect(searchableName(full)).toBe(expected);
    });

    it('falls back to the full name when everything is noise', () => {
        expect(searchableName('FIF - RESP LIMITADA')).toBe('FIF - RESP LIMITADA');
    });
});

describe('parseInvestableClasses', () => {
    it('keeps only open FIF classes in normal operation with at least one million of net worth', () => {
        const { read, classes } = parseInvestableClasses(CLASSES);

        expect(read).toBe(12);
        expect(classes.map((record: FundClassRecord) => record.cnpj)).toEqual([
            '11111111000191',
            '22222222000191',
            '33333333000191',
            '44444444000191',
            '10101010000191',
            '12121212000191',
            '13131313000191'
        ]);
        expect(classes[0]).toEqual({
            registryId: '1',
            cnpj: '11111111000191',
            name: 'ALFA RENDA FIXA FIF CLASSE DE INVESTIMENTO RESP LIMITADA',
            classification: 'Renda Fixa',
            anbima: 'Renda Fixa Simples',
            ownSeries: true
        });
        expect(classes.map((record: FundClassRecord) => record.ownSeries)).toEqual([true, false, true, true, true, true, false]);
    });

    it('rejects a file without the required columns', () => {
        expect(() => parseInvestableClasses('CNPJ_Classe;Tipo_Classe\r\n1;2\r\n')).toThrow();
    });
});

describe('parseActiveSubclasses', () => {
    it('keeps active subclasses of the investable classes, inheriting the audience only when the class has its own series', () => {
        const { classes } = parseInvestableClasses(CLASSES);

        const subclasses = parseActiveSubclasses(
            SUBCLASSES,
            classes.filter((record: FundClassRecord) => ['2', '3'].includes(record.registryId))
        );

        expect(subclasses.map((subclass) => subclass.subclassId)).toEqual(['BETA0001', 'GAMA0001']);
    });
});

describe('fundSeries', () => {
    it('emits the class and one series per subclass, naming the subclass after its class when it does not repeat it', () => {
        const { classes } = parseInvestableClasses(CLASSES);
        const subclasses = parseActiveSubclasses(SUBCLASSES, classes);

        const series: FundSeries[] = fundSeries(classes, subclasses);

        expect(series.map((entry: FundSeries) => entry.key)).toEqual([
            '11111111000191',
            '22222222000191:BETA0001',
            '33333333000191',
            '33333333000191:GAMA0001',
            '44444444000191',
            '10101010000191',
            '12121212000191'
        ]);
        expect(series.find((entry: FundSeries) => entry.key === '22222222000191:BETA0001')?.name).toBe(
            'BETA AÇÕES EM AÇÕES SUBCLASSE I DO BETA AÇÕES'
        );
        expect(series.find((entry: FundSeries) => entry.key === '33333333000191:GAMA0001')?.name).toBe('GAMA MACRO - MULTIMERCADO SENIOR');
    });

    it('uses the subclass name alone when it already contains the class name', () => {
        const series: FundSeries[] = fundSeries(
            [{ registryId: '1', cnpj: '11111111000191', name: 'ALFA FIF RESP LIMITADA', classification: '', anbima: '', ownSeries: true }],
            [{ registryId: '1', subclassId: 'S1', name: 'SUBCLASSE I DO ALFA FIF RESP LIMITADA' }]
        );

        expect(series.map((entry: FundSeries) => entry.name)).toEqual(['ALFA', 'SUBCLASSE I DO ALFA']);
    });

    it('turns a series into a fund asset keyed by the CNPJ digits', () => {
        const asset = fundAsset({
            key: '33333333000191:GAMA0001',
            cnpj: '33333333000191',
            name: 'GAMA',
            fullName: 'GAMA FIF',
            classification: 'Renda Fixa',
            anbima: 'Renda Fixa Simples'
        });

        expect(asset).toEqual({
            externalId: '33333333000191:GAMA0001',
            symbol: '33333333000191',
            name: 'GAMA',
            kind: 'fund',
            currency: 'BRL',
            raw: { cnpj: '33333333000191', fullName: 'GAMA FIF', classification: 'Renda Fixa', anbima: 'Renda Fixa Simples' }
        });
    });
});
