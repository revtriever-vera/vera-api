import { mulDecimal } from '../../../../shared/utils/decimal.util';
import { CryptoAmount, CryptoEvent, UsdRates } from './crypto-events.types';

export const BRL: string = 'BRL';
const FIAT_ASSETS: ReadonlySet<string> = new Set([BRL, 'USD']);
const DOLLAR_ASSETS: ReadonlySet<string> = new Set(['USD', 'USDT', 'USDC', 'BUSD', 'DAI', 'FDUSD', 'TUSD']);

export function isFiat(asset: string): boolean {
    return FIAT_ASSETS.has(asset);
}

export function isDollar(asset: string): boolean {
    return DOLLAR_ASSETS.has(asset);
}

function amountsOf(event: CryptoEvent): CryptoAmount[] {
    if (event.kind === 'exchange') {
        return [
            event.sold,
            event.bought,
            ...(event.valuation === null ? [] : [event.valuation]),
            ...(event.fee === null ? [] : [event.fee])
        ];
    }
    if (event.kind === 'income') {
        return event.valuation === null ? [] : [event.valuation];
    }
    return [];
}

export function usesDollar(event: CryptoEvent): boolean {
    return amountsOf(event).some((amount: CryptoAmount): boolean => isDollar(amount.asset));
}

export function brlOf(amount: CryptoAmount, tradeDate: string, rates: UsdRates): string | null {
    if (amount.asset === BRL) {
        return amount.quantity;
    }
    const rate: string | undefined = rates.get(tradeDate);
    return isDollar(amount.asset) && rate !== undefined ? mulDecimal(amount.quantity, rate) : null;
}

export function valueOfExchange(event: Extract<CryptoEvent, { kind: 'exchange' }>, rates: UsdRates): string | null {
    const candidates: readonly (CryptoAmount | null)[] = [
        event.sold.asset === BRL ? event.sold : null,
        event.bought.asset === BRL ? event.bought : null,
        event.valuation,
        event.sold,
        event.bought
    ];
    for (const amount of candidates) {
        const value: string | null = amount === null ? null : brlOf(amount, event.tradeDate, rates);
        if (value !== null) {
            return value;
        }
    }
    return null;
}
