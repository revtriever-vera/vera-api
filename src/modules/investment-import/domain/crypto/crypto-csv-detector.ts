import { RawTable } from '../b3/b3-cells';
import { ColumnSpec, HeaderMatch, locateHeader } from '../b3/b3-columns';
import { Collected } from '../b3/b3-rows';
import { BINANCE_STATEMENT_SPEC, BINANCE_TRADE_SPEC, parseBinanceStatement, parseBinanceTrades } from './binance.mapper';
import { COINBASE_SPEC, parseCoinbase } from './coinbase.mapper';
import { CRYPTO_EXCHANGES, CryptoEvent, CryptoExchange } from './crypto-events.types';
import { MERCADO_BITCOIN_SPEC, parseMercadoBitcoin } from './mercado-bitcoin.mapper';

export interface CryptoSheet {
    readonly exchange: CryptoExchange;
    readonly parse: () => Collected<CryptoEvent>;
}

type Detector = (table: RawTable) => CryptoSheet | null;

function detectorOf<K extends string>(
    exchange: CryptoExchange,
    spec: ColumnSpec<K>,
    parse: (table: RawTable, match: HeaderMatch<K>) => Collected<CryptoEvent>
): Detector {
    return (table: RawTable): CryptoSheet | null => {
        const match: HeaderMatch<K> | null = locateHeader(table.rows, spec);
        return match === null ? null : { exchange, parse: (): Collected<CryptoEvent> => parse(table, match) };
    };
}

const DETECTORS: readonly Detector[] = [
    detectorOf(CRYPTO_EXCHANGES.binance, BINANCE_TRADE_SPEC, parseBinanceTrades),
    detectorOf(CRYPTO_EXCHANGES.binance, BINANCE_STATEMENT_SPEC, parseBinanceStatement),
    detectorOf(CRYPTO_EXCHANGES.coinbase, COINBASE_SPEC, parseCoinbase),
    detectorOf(CRYPTO_EXCHANGES.mercadoBitcoin, MERCADO_BITCOIN_SPEC, parseMercadoBitcoin)
];

export function detectCryptoSheet(table: RawTable): CryptoSheet | null {
    for (const detect of DETECTORS) {
        const sheet: CryptoSheet | null = detect(table);
        if (sheet !== null) {
            return sheet;
        }
    }
    return null;
}
