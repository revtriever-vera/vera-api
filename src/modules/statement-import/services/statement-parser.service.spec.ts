import { describe, expect, it } from 'vitest';
import { fixture } from '../../../../test/support/statement-fixtures';
import { TransactionFingerprintService } from '../../transactions/services/transaction-fingerprint.service';
import { FileTooLargeError, InvalidFileError, TooManyRowsError, UnsupportedFormatError } from '../domain/statement-import.errors';
import { CsvMapping } from '../domain/statement-import.types';
import { StatementParserService } from './statement-parser.service';

const MAPPING: CsvMapping = {
    hasHeader: true,
    dateColumn: 0,
    descriptionColumn: 1,
    amountColumn: 2,
    dateFormat: 'dd/MM/yyyy',
    decimalSeparator: ',',
    invertSign: false
};

function service(): StatementParserService {
    return new StatementParserService(new TransactionFingerprintService());
}

function csv(lines: string[]): Buffer {
    return Buffer.from(['Data;Histórico;Valor', ...lines].join('\n'), 'utf-8');
}

describe('StatementParserService.parse', () => {
    it('detecta o formato, lê o arquivo e devolve o hash do conteúdo', () => {
        const bytes: Buffer = fixture('itau-conta-1.02.ofx');

        const parsed = service().parse(bytes, { currency: null });

        expect(parsed.detectedFormat).toBe('ofx');
        expect(parsed.statement.rows).toHaveLength(4);
        expect(parsed.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(parsed.sizeBytes).toBe(bytes.length);
        expect(service().parse(bytes, { currency: null }).sha256).toBe(parsed.sha256);
    });

    it('o format forçado vence a detecção, e o detectado continua informado', () => {
        const parsed = service().parse(csv(['01/09/2026;a;-1,00']), { format: 'csv_generic', mapping: MAPPING, currency: null });

        expect(parsed.detectedFormat).toBe('csv_generic');
        expect(() => service().parse(csv(['01/09/2026;a;-1,00']), { format: 'ofx', currency: null })).toThrow(InvalidFileError);
        expect(() => service().parse(csv(['01/09/2026;a;-1,00']), { format: 'csv_nubank_card', currency: null })).toThrow(InvalidFileError);
    });

    it('recusa arquivo binário, zip e texto sem formato', () => {
        const zip: Buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00]);

        expect(() => service().parse(zip, { currency: null })).toThrow(UnsupportedFormatError);
        expect(() => service().parse(zip, { format: 'ofx', currency: null })).toThrow(UnsupportedFormatError);
        expect(() => service().parse(Buffer.from('só texto'), { currency: null })).toThrow(UnsupportedFormatError);
    });

    it('recusa mais de 5 MB sem ler', () => {
        expect(() => service().parse(Buffer.alloc(5 * 1024 * 1024 + 1, 0x61), { currency: null })).toThrow(FileTooLargeError);
    });

    it('recusa mais de 10.000 linhas válidas', () => {
        const lines: string[] = Array.from({ length: 10_001 }, () => '01/09/2026;a;-1,00');

        expect(() => service().parse(csv(lines), { mapping: MAPPING, currency: null })).toThrow(TooManyRowsError);
        expect(service().parse(csv(lines.slice(1)), { mapping: MAPPING, currency: null }).statement.rows).toHaveLength(10_000);
    });

    it('recusa registros demais mesmo que sejam todos inválidos', () => {
        const lines: string[] = Array.from({ length: 50_001 }, () => 'x;y;z');

        expect(() => service().parse(csv(lines), { mapping: MAPPING, currency: null })).toThrow(TooManyRowsError);
    });

    it('recusa arquivo sem nenhuma linha válida', () => {
        expect(() => service().parse(csv(['31/02/2026;a;-1,00']), { mapping: MAPPING, currency: null })).toThrow(InvalidFileError);
    });

    it('recusa intervalo de datas maior que 5 anos', () => {
        expect(() => service().parse(csv(['01/01/2020;a;-1,00', '02/01/2026;b;-1,00']), { mapping: MAPPING, currency: null })).toThrow(
            InvalidFileError
        );
        expect(
            service().parse(csv(['01/01/2021;a;-1,00', '01/01/2026;b;-1,00']), { mapping: MAPPING, currency: null }).statement.rows
        ).toHaveLength(2);
    });

    it('recusa aspa sem fechamento', () => {
        expect(() => service().parse(csv(['01/09/2026;"a;-1,00']), { mapping: MAPPING, currency: null })).toThrow(InvalidFileError);
    });

    it('CSV genérico sem mapping devolve as colunas e não exige linhas válidas', () => {
        const parsed = service().parse(csv(['01/09/2026;a;-1,00']), { currency: null });

        expect(parsed.statement.columns).toEqual(['Data', 'Histórico', 'Valor']);
        expect(parsed.statement.pendingMappingRecords).toBe(1);
    });

    it('usa o delimitador do mapping quando ele vem', () => {
        const parsed = service().parse(Buffer.from('Data,Histórico,Valor\n01/09/2026,a,"-1,00"'), {
            mapping: { ...MAPPING, delimiter: ',' },
            currency: null
        });

        expect(parsed.statement.rows[0]?.amountMinor).toBe(-100);
    });
});

describe('StatementParserService.toIncoming', () => {
    const rows = (...ids: (string | null)[]) =>
        ids.map((externalId: string | null, index: number) => ({
            line: index + 1,
            date: '2026-09-01',
            amountMinor: -500,
            description: 'PADARIA ESTRELA',
            externalId
        }));

    it('mantém o identificador do arquivo quando ele é único', () => {
        const items = service().toIncoming(rows('ofx:1', 'ofx:2'), 'acc-1', 'BRL');

        expect(items.map((item) => item.externalId)).toEqual(['ofx:1', 'ofx:2']);
        expect(items[0]).toMatchObject({ currency: 'BRL', date: '2026-09-01', amountMinor: -500 });
    });

    it('troca o identificador repetido no arquivo por fingerprint e numera as ocorrências iguais', () => {
        const items = service().toIncoming(rows('ofx:1', 'ofx:1', null), 'acc-1', 'BRL');
        const ids: string[] = items.map((item) => item.externalId);

        expect(ids.every((id: string) => id.startsWith('csv:'))).toBe(true);
        expect(new Set(ids).size).toBe(3);
    });

    it('o fingerprint é estável entre importações e muda com a conta', () => {
        const first = service()
            .toIncoming(rows(null, null), 'acc-1', 'BRL')
            .map((item) => item.externalId);
        const again = service()
            .toIncoming(rows(null, null), 'acc-1', 'BRL')
            .map((item) => item.externalId);
        const other = service()
            .toIncoming(rows(null, null), 'acc-2', 'BRL')
            .map((item) => item.externalId);

        expect(again).toEqual(first);
        expect(other).not.toEqual(first);
    });
});
