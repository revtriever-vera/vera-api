import { JsonObject } from '../llm.types';

const TRANSACTION_SCHEMA: JsonObject = {
    type: 'object',
    properties: {
        date: { type: 'string', description: 'ISO date of the transaction, YYYY-MM-DD' },
        description: { type: 'string', description: 'description of the transaction exactly as printed' },
        amountMinor: {
            type: 'integer',
            description: 'signed amount in the currency minor unit (cents): negative when money left the account, positive when it came in'
        }
    },
    required: ['date', 'description', 'amountMinor']
};

export const STATEMENT_EXTRACT_SCHEMA: JsonObject = {
    type: 'object',
    properties: {
        currency: { type: 'string', description: 'ISO 4217 code of the statement' },
        institution: { type: ['string', 'null'], description: 'bank or card issuer printed on the statement, null when none is printed' },
        accountLast4: {
            type: ['string', 'null'],
            description: 'last four digits of the account or card number when printed, null otherwise'
        },
        transactions: { type: 'array', items: TRANSACTION_SCHEMA }
    },
    required: ['currency', 'transactions']
};
