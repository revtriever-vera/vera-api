const EDGE_START: string = String.raw`(?<![\p{L}\p{N}_])`;
const EDGE_END: string = String.raw`(?![\p{L}\p{N}_])`;

const KNOWN_US_TICKERS: string = String.raw`AAPL|MSFT|GOOGL|GOOG|AMZN|TSLA|NVDA|META|NFLX|SPY|QQQ|VOO|IVV|VTI|BRK\.B`;

const ASSET_WORDS: RegExp = new RegExp(
    String.raw`${EDGE_START}(?:cdbs?|lcis?|lcas?|tesouro|fiis?|etfs?|a[çc][ãa]o|a[çc][õo]es|fundos?(?! de emerg[êe]ncia)|(?<!emergency )funds?|stocks?|bonds?|cripto\p{L}*|crypto\p{L}*|bitcoin|ethereum|btc|eth|solana)${EDGE_END}`,
    'iu'
);
const B3_TICKER: RegExp = new RegExp(String.raw`${EDGE_START}[A-Z]{4}\d{1,2}${EDGE_END}`, 'u');
const US_TICKER: RegExp = new RegExp(String.raw`(?:\$[A-Z]{1,5}|${EDGE_START}(?:${KNOWN_US_TICKERS}))${EDGE_END}`, 'u');

export function mentionsAsset(text: string): boolean {
    return ASSET_WORDS.test(text) || B3_TICKER.test(text) || US_TICKER.test(text);
}
