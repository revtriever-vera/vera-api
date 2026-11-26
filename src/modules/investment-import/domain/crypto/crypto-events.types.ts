import { IgnoredLine, IncomeKind, RejectedLine } from '../investment-statement.types';

export const CRYPTO_EXCHANGES = { binance: 'Binance', mercadoBitcoin: 'Mercado Bitcoin', coinbase: 'Coinbase' } as const;
export type CryptoExchange = (typeof CRYPTO_EXCHANGES)[keyof typeof CRYPTO_EXCHANGES];

export interface CryptoAmount {
    readonly asset: string;
    readonly quantity: string;
}

interface EventBase {
    readonly line: number;
    readonly tradeDate: string;
    readonly externalId: string | null;
}

export interface ExchangeEvent extends EventBase {
    readonly kind: 'exchange';
    readonly sold: CryptoAmount;
    readonly bought: CryptoAmount;
    readonly valuation: CryptoAmount | null;
    readonly fee: CryptoAmount | null;
}

export interface TransferEvent extends EventBase {
    readonly kind: 'transfer';
    readonly direction: 'credit' | 'debit';
    readonly moved: CryptoAmount;
}

export interface IncomeEvent extends EventBase {
    readonly kind: 'income';
    readonly incomeKind: IncomeKind;
    readonly received: CryptoAmount;
    readonly valuation: CryptoAmount | null;
}

export type CryptoEvent = ExchangeEvent | TransferEvent | IncomeEvent;

export interface CryptoReading {
    readonly exchange: CryptoExchange;
    readonly events: readonly CryptoEvent[];
    readonly ignored: readonly IgnoredLine[];
    readonly rejected: readonly RejectedLine[];
}

export type UsdRates = ReadonlyMap<string, string>;
