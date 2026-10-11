import { describe, expect, it } from 'vitest';
import { fixture } from '../../../../test/support/statement-fixtures';
import { InvalidFileError, TooManyRowsError } from './statement-import.errors';
import { OfxToken, decodeEntities, tokenizeOfx } from './ofx-tokenizer';
import { parseOfx } from './ofx-parser';
import { decodeStatement } from './text-decoding';

function parse(name: string, currency: string | null = null) {
    return parseOfx(decodeStatement(fixture(name)), currency);
}

describe('parseOfx', () => {
    it('lê o SGML 1.02 do Itaú sem tags de fechamento, com fuso, vírgula e MEMO junto do NAME', () => {
        const statement = parse('itau-conta-1.02.ofx');

        expect(statement.currency).toBe('BRL');
        expect(statement.accountHint).toEqual({ institution: 'Itaú', numberLast4: '5678' });
        expect(statement.rejections).toEqual([]);
        expect(statement.rows.map((row) => [row.date, row.amountMinor, row.description, row.externalId])).toEqual([
            ['2026-09-05', 1_250_000, 'SALÁRIO EMPRESA X CRÉDITO DE SALÁRIO', 'ofx:2026090501'],
            ['2026-09-06', -480_000, 'ALUGUEL IMOBILIÁRIA', 'ofx:2026090602'],
            ['2026-09-08', -123_456, 'BOLETO 000123 CONDOMÍNIO EDIFÍCIO SOL', 'ofx:2026090803'],
            ['2026-09-12', -8_990, 'PIX ENVIADO MARIA SOUZA', 'ofx:2026091204']
        ]);
    });

    it('lê o XML 2.x do Banco do Brasil com entidades básicas e instituição pelo BANKID', () => {
        const statement = parse('bb-conta-2.ofx');

        expect(statement.accountHint).toEqual({ institution: 'Banco do Brasil', numberLast4: '7654' });
        expect(statement.rows.map((row) => [row.date, row.amountMinor, row.description])).toEqual([
            ['2026-09-03', -25_000, 'COMPRA & CIA SUPERMERCADO COMPRA CARTAO'],
            ['2026-09-10', 150_000, 'TED RECEBIDA'],
            ['2026-09-15', -7_530, 'PAGAMENTO CONTA LUZ']
        ]);
    });

    it('lê a fatura do cartão (CCACCTFROM), guarda só os 4 últimos dígitos e usa ORG como instituição', () => {
        const statement = parse('nubank-cartao-1.02.ofx');

        expect(statement.accountHint).toEqual({ institution: 'Nubank', numberLast4: '4321' });
        expect(statement.rows.map((row) => [row.amountMinor, row.description])).toEqual([
            [-3_250, 'Uber *Trip'],
            [-3_490, 'Spotify'],
            [-21_000, 'Açaí e Pão de Queijo'],
            [90_000, 'Pagamento recebido']
        ]);
    });

    it('usa a moeda pedida para os centavos e a do CURDEF quando não pedem', () => {
        const text: string = '<OFX><CURDEF>JPY<STMTTRN><DTPOSTED>20260901<TRNAMT>-1500<FITID>a<NAME>x</STMTTRN></OFX>';

        expect(parseOfx(text, null).rows[0]?.amountMinor).toBe(-1500);
        expect(parseOfx(text, null).currency).toBe('JPY');
        expect(parseOfx(text, 'BRL').rows[0]?.amountMinor).toBe(-150_000);
    });

    it('rejeita linha ilegível com a razão e o número da linha, sem derrubar o arquivo', () => {
        const text: string = [
            '<OFX>',
            '<STMTTRN><DTPOSTED>20261340<TRNAMT>-1.00<FITID>1<NAME>data ruim</STMTTRN>',
            '<STMTTRN><DTPOSTED>20260901<TRNAMT>abc<FITID>2<NAME>valor ruim</STMTTRN>',
            '<STMTTRN><DTPOSTED>20260901<TRNAMT>0.00<FITID>3<NAME>zero</STMTTRN>',
            '<STMTTRN><DTPOSTED>20260901<TRNAMT>-5.00<FITID>4</STMTTRN>',
            '<STMTTRN><DTPOSTED>20260901<TRNAMT>-5.00<FITID>5<NAME>boa</STMTTRN>',
            '</OFX>'
        ].join('\n');

        const statement = parseOfx(text, null);

        expect(statement.rejections).toEqual([
            { line: 2, reason: 'invalid_date' },
            { line: 3, reason: 'invalid_amount' },
            { line: 4, reason: 'zero_amount' },
            { line: 5, reason: 'empty_description' }
        ]);
        expect(statement.rows).toHaveLength(1);
    });

    it('sem FITID ou com FITID gigante deixa o identificador para o fingerprint', () => {
        const text: string = `<OFX><STMTTRN><DTPOSTED>20260901<TRNAMT>-5.00<NAME>sem id</STMTTRN><STMTTRN><DTPOSTED>20260901<TRNAMT>-6.00<FITID>${'9'.repeat(400)}<NAME>id longo</STMTTRN></OFX>`;

        expect(parseOfx(text, null).rows.map((row) => row.externalId)).toEqual([null, null]);
    });

    it('trata entidade e DOCTYPE como texto, sem expandir nada', () => {
        const text: string = [
            '<?xml version="1.0"?>',
            '<!DOCTYPE OFX [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> <!ENTITY lol "lol"> ]>',
            '<OFX><STMTTRN><DTPOSTED>20260901</DTPOSTED><TRNAMT>-5.00</TRNAMT><FITID>1</FITID><NAME>&xxe; &lol; &amp;lt;</NAME></STMTTRN></OFX>'
        ].join('\n');

        const description: string | undefined = parseOfx(text, null).rows[0]?.description;

        expect(description).toBe('&xxe; &lol; &lt;');
        expect(description).not.toContain('root');
    });

    it('recusa o que não tem a tag raiz e o que passa do limite de transações', () => {
        expect(() => parseOfx('OFXHEADER:100\nnada de tags', null)).toThrow(InvalidFileError);
        const many: string = `<OFX>${'<STMTTRN><DTPOSTED>20260901<TRNAMT>-1.00<NAME>x</STMTTRN>'.repeat(50_001)}</OFX>`;
        expect(() => parseOfx(many, null)).toThrow(TooManyRowsError);
    });

    it('aceita STMTTRN sem fechamento', () => {
        const text: string = '<OFX><STMTTRN><DTPOSTED>20260901<TRNAMT>-1.00<NAME>a<STMTTRN><DTPOSTED>20260902<TRNAMT>-2.00<NAME>b</OFX>';

        expect(parseOfx(text, null).rows.map((row) => row.amountMinor)).toEqual([-100, -200]);
    });

    it('não confunde "<" solto no texto com uma tag', () => {
        const text: string = '<OFX><STMTTRN><DTPOSTED>20260901<TRNAMT>-1.00<NAME>a < b > c</STMTTRN></OFX>';

        expect(parseOfx(text, null).rows[0]?.description).toBe('a < b > c');
    });
});

describe('tokenizeOfx', () => {
    it('devolve abertura com valor, fechamento e a linha de cada tag', () => {
        const tokens: OfxToken[] = tokenizeOfx('<A>\n<B>x\n</B>\n</A>');

        expect(tokens.map((token) => [token.kind, token.name, token.value, token.line])).toEqual([
            ['open', 'A', '', 1],
            ['open', 'B', 'x', 2],
            ['close', 'B', '', 3],
            ['close', 'A', '', 4]
        ]);
    });

    it('é linear em arquivo de uma linha só e em "<" repetido', () => {
        const startedAt: number = Date.now();

        tokenizeOfx(`${'<'.repeat(200_000)}>${'<A>x'.repeat(20_000)}`);
        tokenizeOfx('<OFX>'.repeat(50_000));

        expect(Date.now() - startedAt).toBeLessThan(2000);
    });

    it('decodifica só as cinco entidades básicas, uma vez', () => {
        expect(decodeEntities('a &amp; b &lt;&gt;&quot;&apos; &amp;amp; &#65;')).toBe('a & b <>"\' &amp; &#65;');
    });
});
