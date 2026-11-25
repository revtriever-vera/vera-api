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
        quantity: { type: 'string', description: 'decimal number as text, dot separator' },
        unitPrice: { type: ['string', 'null'], description: 'decimal number as text, dot separator' },
        grossMinor: { type: ['integer', 'null'], description: 'gross amount in the currency minor unit' },
        currency: { type: 'string', description: 'ISO 4217 code' }
    },
    required: ['kind', 'direction', 'tradeDate', 'ticker', 'quantity', 'currency']
};

export const INVESTMENT_EXTRACT_SCHEMA: JsonObject = {
    type: 'object',
    properties: {
        currency: { type: 'string', description: 'ISO 4217 code of the statement' },
        operations: { type: 'array', items: OPERATION_SCHEMA }
    },
    required: ['currency', 'operations']
};
