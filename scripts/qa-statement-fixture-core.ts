import { addDays, firstDayOf, monthOf } from '../src/modules/transactions/domain/calendar';
import { buildSpendingDataset, DatasetTransaction, SpendingDataset } from '../src/modules/transactions/domain/spending-dataset';

export interface QaStatementFiles {
    readonly ofx: Buffer;
    readonly csv: Buffer;
}

interface QaLine {
    readonly date: string;
    readonly description: string;
    readonly amountMinor: number;
}

const CARD_ACCOUNT: string = 'nubank-card';
const FILE_BASE_MESSAGE: string = 'dataset entry missing';

function formatAmount(amountMinor: number, decimal: ',' | '.'): string {
    const sign: string = amountMinor < 0 ? '-' : '';
    const absolute: number = Math.abs(amountMinor);
    const whole: string = String(Math.trunc(absolute / 100));
    const cents: string = String(absolute % 100).padStart(2, '0');
    return `${sign}${whole}${decimal}${cents}`;
}

function brazilianDate(date: string): string {
    const [year, month, day] = date.split('-');
    return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

function datasetEntry(transactions: readonly DatasetTransaction[], key: string): DatasetTransaction {
    const found: DatasetTransaction | undefined = transactions.find((candidate: DatasetTransaction): boolean => candidate.key === key);
    if (found === undefined) {
        throw new Error(`${FILE_BASE_MESSAGE}: ${key}`);
    }
    return found;
}

function ofxTransaction(line: QaLine, index: number): string {
    return [
        '<STMTTRN>',
        '<TRNTYPE>DEBIT',
        `<DTPOSTED>${line.date.replace(/-/g, '')}000000[-3:BRT]`,
        `<TRNAMT>${formatAmount(line.amountMinor, '.')}`,
        `<FITID>QA-${String(index + 1).padStart(4, '0')}`,
        `<MEMO>${line.description}`,
        '</STMTTRN>'
    ].join('\r\n');
}

const OFX_HEADER: readonly string[] = [
    'OFXHEADER:100',
    'DATA:OFXSGML',
    'VERSION:102',
    'SECURITY:NONE',
    'ENCODING:USASCII',
    'CHARSET:1252',
    'COMPRESSION:NONE',
    'OLDFILEUID:NONE',
    'NEWFILEUID:NONE',
    ''
];

const OFX_CARD_ACCOUNT: readonly string[] = ['<CCACCTFROM>', '<ACCTID>QA-CARD-4321', '</CCACCTFROM>'];

function ofxSignon(end: string): string[] {
    return [
        '<OFX>',
        '<SIGNONMSGSRSV1>',
        '<SONRS>',
        '<STATUS><CODE>0<SEVERITY>INFO</STATUS>',
        `<DTSERVER>${end.replace(/-/g, '')}120000[-3:BRT]`,
        '<LANGUAGE>POR',
        '<FI><ORG>Nubank<FID>260</FI>',
        '</SONRS>',
        '</SIGNONMSGSRSV1>'
    ];
}

function ofxStatement(lines: readonly QaLine[], start: string, end: string): string[] {
    return [
        '<CREDITCARDMSGSRSV1>',
        '<CCSTMTTRNRS>',
        '<TRNUID>1',
        '<STATUS><CODE>0<SEVERITY>INFO</STATUS>',
        '<CCSTMTRS>',
        '<CURDEF>BRL',
        ...OFX_CARD_ACCOUNT,
        '<BANKTRANLIST>',
        `<DTSTART>${start.replace(/-/g, '')}000000[-3:BRT]`,
        `<DTEND>${end.replace(/-/g, '')}000000[-3:BRT]`,
        ...lines.map(ofxTransaction),
        '</BANKTRANLIST>',
        '</CCSTMTRS>',
        '</CCSTMTTRNRS>',
        '</CREDITCARDMSGSRSV1>',
        '</OFX>',
        ''
    ];
}

function ofxDocument(lines: readonly QaLine[], start: string, end: string): string {
    return [...OFX_HEADER, ...ofxSignon(end), ...ofxStatement(lines, start, end)].join('\r\n');
}

function cardLines(today: string): QaLine[] {
    const dataset: SpendingDataset = buildSpendingDataset(today);
    const ride: DatasetTransaction = datasetEntry(dataset.transactions, `${dataset.closedMonth}:${CARD_ACCOUNT}:ride`);
    const spotify: DatasetTransaction = datasetEntry(dataset.transactions, `${dataset.closedMonth}:${CARD_ACCOUNT}:spotify`);
    const firstOfMonth: string = firstDayOf(dataset.currentMonth);
    return [
        { date: ride.date, description: ride.description, amountMinor: ride.amountMinor },
        { date: addDays(spotify.date, 1), description: spotify.description, amountMinor: spotify.amountMinor },
        { date: firstOfMonth, description: 'PADARIA ESTRELA', amountMinor: -1_800 },
        { date: firstOfMonth, description: 'DROGASIL', amountMinor: -4_590 },
        { date: firstOfMonth, description: 'POSTO IPIRANGA', amountMinor: -20_000 },
        { date: firstOfMonth, description: 'LIVRARIA CULTURA', amountMinor: -12_000 }
    ];
}

function genericLines(today: string): QaLine[] {
    const firstOfMonth: string = firstDayOf(monthOf(today));
    return [
        { date: firstOfMonth, description: 'MERCADO DO ZE', amountMinor: -5_230 },
        { date: firstOfMonth, description: 'IFOOD *LANCHE', amountMinor: -3_500 },
        { date: firstOfMonth, description: 'PIX RECEBIDO JOAO', amountMinor: 15_000 }
    ];
}

function csvDocument(lines: readonly QaLine[]): string {
    const body: string[] = lines.map(
        (line: QaLine): string => `${brazilianDate(line.date)};${line.description};${formatAmount(line.amountMinor, ',')}`
    );
    return ['Data;Histórico;Valor', ...body, ''].join('\n');
}

export function buildQaStatementFiles(today: string): QaStatementFiles {
    const lines: QaLine[] = cardLines(today);
    const dates: string[] = lines.map((line: QaLine): string => line.date).sort();
    return {
        ofx: Buffer.from(ofxDocument(lines, dates[0] ?? today, dates[dates.length - 1] ?? today), 'latin1'),
        csv: Buffer.from(csvDocument(genericLines(today)), 'utf-8')
    };
}

export interface QaOptions {
    readonly out: string;
    readonly today: string;
}

const TODAY_PATTERN: RegExp = /^\d{4}-\d{2}-\d{2}$/;

export function optionsFrom(args: readonly string[], now: Date): QaOptions {
    const read = (flag: string): string | undefined => {
        const index: number = args.indexOf(flag);
        return index === -1 ? undefined : args[index + 1];
    };
    const out: string | undefined = read('--out');
    const today: string = read('--today') ?? now.toISOString().slice(0, 10);
    if (out === undefined || out.startsWith('--')) {
        throw new Error('usage: npm run qa:statement-fixture -- --out <folder> [--today YYYY-MM-DD]');
    }
    if (!TODAY_PATTERN.test(today)) {
        throw new Error('--today must be YYYY-MM-DD');
    }
    return { out, today };
}
