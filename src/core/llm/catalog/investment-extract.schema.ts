import { JsonObject } from '../llm.types';

const NULLABLE_STRING: JsonObject = { type: ['string', 'null'] };

const OPERATION_SCHEMA: JsonObject = {
    type: 'object',
    properties: {
        kind: { type: 'string', enum: ['buy', 'sell', 'split', 'reverse_split', 'bonus', 'income', 'transfer'] },
        incomeKind: { type: ['string', 'null'], enum: ['dividend', 'jcp', 'fii_income', 'interest', 'staking', null] },
        direction: { type: 'string', enum: ['credit', 'debit'] },
        tradeDate: { type: 'string', description: 'ISO date, YYYY-MM-DD' },
        ticker: { type: 'string' },
        productName: NULLABLE_STRING,
        institution: NULLABLE_STRING,
        market: NULLABLE_STRING,
        securityId: { type: ['string', 'null'], description: 'CUSIP or ISIN as printed, null when none is printed' },
        quantity: { type: 'string', description: 'decimal number as text, dot separator' },
        unitPrice: { type: ['string', 'null'], description: 'decimal number as text, dot separator' },
        grossMinor: { type: ['integer', 'null'], description: 'gross amount in the currency minor unit' },
        currency: { type: 'string', description: 'ISO 4217 code' }
    },
    required: ['kind', 'direction', 'tradeDate', 'ticker', 'quantity', 'currency']
};

const POSITION_SCHEMA: JsonObject = {
    type: 'object',
    properties: {
        block: { type: 'string', enum: ['equities', 'options', 'fixed_income', 'mutual_fund'] },
        symbol: { type: 'string' },
        quantity: { type: 'string', description: 'decimal number as text, dot separator' },
        price: {
            type: ['string', 'null'],
            description: 'closing price per unit as printed in the summary, decimal text, null when none is printed'
        }
    },
    required: ['block', 'symbol', 'quantity']
};

const WITHHOLDING_SCHEMA: JsonObject = {
    type: 'object',
    properties: {
        tradeDate: { type: 'string', description: 'ISO date, YYYY-MM-DD' },
        ticker: { type: 'string' },
        amountMinor: { type: 'integer', description: 'tax withheld as a positive amount in the currency minor unit' }
    },
    required: ['tradeDate', 'ticker', 'amountMinor']
};

const CASH_MOVEMENT_SCHEMA: JsonObject = {
    type: 'object',
    properties: {
        tradeDate: { type: 'string', description: 'ISO date, YYYY-MM-DD' },
        direction: { type: 'string', enum: ['credit', 'debit'] },
        amountMinor: { type: 'integer', description: 'absolute amount in the currency minor unit' }
    },
    required: ['tradeDate', 'direction', 'amountMinor']
};

const MINOR_INTEGER: JsonObject = { type: ['integer', 'null'] };

const NOTE_TRADE_SCHEMA: JsonObject = {
    type: 'object',
    properties: {
        side: { type: 'string', enum: ['buy', 'sell'], description: 'C (compra) is buy, V (venda) is sell' },
        code: {
            type: ['string', 'null'],
            description: 'trading code printed on the line (PETR4), null when only the security name is printed'
        },
        securitySpec: {
            type: ['string', 'null'],
            description: 'security specification exactly as printed ("especificação do título", e.g. PETROBRAS PN N2)'
        },
        market: { type: ['string', 'null'], description: 'market as printed (VISTA, FRACIONARIO, OPCAO DE COMPRA, TERMO)' },
        quantity: { type: 'string', description: 'decimal number as text, dot separator' },
        unitPrice: { type: ['string', 'null'], description: 'decimal number as text, dot separator' },
        grossMinor: { type: ['integer', 'null'], description: 'value of the operation in cents' },
        dayTrade: { type: ['boolean', 'null'], description: 'true when the line is marked D (day trade)' }
    },
    required: ['side', 'quantity']
};

const NOTE_SCHEMA: JsonObject = {
    type: 'object',
    properties: {
        number: { type: ['string', 'null'], description: 'note number as printed' },
        tradeDate: { type: 'string', description: 'ISO date of the trading session (data do pregão), YYYY-MM-DD' },
        broker: { type: ['string', 'null'] },
        trades: { type: 'array', items: NOTE_TRADE_SCHEMA },
        operationsTotalMinor: { ...MINOR_INTEGER, description: '"Valor das operações" printed in the financial summary, in cents' },
        netMinor: {
            ...MINOR_INTEGER,
            description: '"Líquido para" in cents: positive when the note ends in credit (C), negative when it ends in debit (D)'
        },
        fees: {
            type: 'object',
            properties: {
                settlementMinor: { ...MINOR_INTEGER, description: 'taxa de liquidação' },
                exchangeMinor: { ...MINOR_INTEGER, description: 'emolumentos (taxa de registro and negociação)' },
                brokerageMinor: { ...MINOR_INTEGER, description: 'corretagem' },
                issMinor: { ...MINOR_INTEGER, description: 'ISS' },
                irrfMinor: { ...MINOR_INTEGER, description: 'I.R.R.F. withheld' },
                otherMinor: { ...MINOR_INTEGER, description: 'any other cost printed (outras, taxa operacional, custódia)' }
            }
        }
    },
    required: ['tradeDate', 'trades']
};

export const INVESTMENT_EXTRACT_SCHEMA: JsonObject = {
    type: 'object',
    properties: {
        documentType: {
            type: 'string',
            enum: ['note', 'b3_report', 'foreign_statement', 'screenshot'],
            description:
                'note: brokerage trade note; b3_report: B3 report; foreign_statement: statement from a broker abroad; screenshot: print or photo of a broker screen'
        },
        currency: { type: 'string', description: 'ISO 4217 code of the statement' },
        totalMinor: {
            type: ['integer', 'null'],
            description: 'Total of the trades as printed on the document, in the currency minor unit; null when the document prints none'
        },
        periodStart: {
            type: ['string', 'null'],
            description: 'ISO date of the first day of the statement period, null when none is printed'
        },
        periodEnd: { type: ['string', 'null'], description: 'ISO date of the last day of the statement period, null when none is printed' },
        operations: { type: 'array', items: OPERATION_SCHEMA },
        positions: { type: 'array', items: POSITION_SCHEMA },
        taxWithholdings: { type: 'array', items: WITHHOLDING_SCHEMA },
        cashMovements: { type: 'array', items: CASH_MOVEMENT_SCHEMA },
        notes: {
            type: 'array',
            description: 'Brokerage trade notes only: one entry per note (a PDF can hold several). Leave `operations` empty for them',
            items: NOTE_SCHEMA
        }
    },
    required: ['documentType', 'currency', 'operations']
};
