import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { nativeValueOf, valueNative, ValuedAmount } from './holding-valuation';
import {
    FIXED_INCOME_TYPE_GROUP,
    HOLDING_KINDS,
    Holding,
    SourceAsset,
    SourcePosition,
    SourceQuote,
    SourceRate,
    SourceTitle,
    USD_CURRENCY,
    VALUE_SOURCE_BY_MARKET,
    VALUE_SOURCE_BY_PROVIDER,
    VALUE_SOURCES,
    ValueSource
} from './portfolio.types';

export type BareHolding = Omit<Holding, 'classId' | 'storedTargetInClassBps' | 'effectiveTargetInClassBps'>;

export interface ValuationContext {
    readonly baseCurrency: string;
    readonly usdRate: SourceRate | null;
}

type PricingFields = Pick<BareHolding, 'unitPrice' | 'priceCurrency' | 'priceDate' | 'valueSource'>;
type QuantityFlags = Pick<BareHolding, 'isZeroQuantity' | 'missingQuote' | 'stale'>;
type AmountFields = Pick<BareHolding, 'nativeValueMinor' | 'nativeCurrency' | 'valueMinor' | 'missingRate'>;

function pricingOf(asset: SourceAsset, quote: SourceQuote | null): PricingFields {
    const byMarket: ValueSource = VALUE_SOURCE_BY_MARKET[asset.market] ?? VALUE_SOURCES.brapi;
    return {
        unitPrice: quote?.price ?? null,
        priceCurrency: quote?.currency ?? null,
        priceDate: quote?.priceDate ?? null,
        valueSource: quote === null ? byMarket : (VALUE_SOURCE_BY_PROVIDER[quote.source] ?? byMarket)
    };
}

function flagsOf(position: SourcePosition, quote: SourceQuote | null): QuantityFlags {
    const isZeroQuantity: boolean = DecimalUtil.of(position.quantity).isZero();
    return {
        isZeroQuantity,
        missingQuote: quote === null && !isZeroQuantity,
        stale: quote?.stale === true && !isZeroQuantity
    };
}

function amountsOf(valued: ValuedAmount, currency: string): AmountFields {
    return {
        nativeValueMinor: valued.nativeValueMinor,
        nativeCurrency: currency,
        valueMinor: valued.valueMinor,
        missingRate: valued.missingRate
    };
}

export function positionHolding(
    position: SourcePosition,
    asset: SourceAsset,
    quote: SourceQuote | null,
    context: ValuationContext
): BareHolding {
    const native: number = quote === null ? 0 : nativeValueOf(position.quantity, quote.price, asset.currency);
    const valued: ValuedAmount = valueNative(native, asset.currency, context.baseCurrency, context.usdRate);
    return {
        kind: HOLDING_KINDS.position,
        id: position.id,
        assetId: asset.id,
        symbol: asset.symbol,
        name: asset.name,
        market: asset.market,
        typeGroup: asset.typeGroup,
        quantity: position.quantity,
        quantityDecimals: asset.quantityDecimals,
        dollarExposure: asset.dollarExposure || asset.currency === USD_CURRENCY,
        estimated: false,
        matured: false,
        indexDataMissing: false,
        ...pricingOf(asset, quote),
        ...flagsOf(position, quote),
        ...amountsOf(valued, asset.currency)
    };
}

function titleFlagsOf(title: SourceTitle): Pick<BareHolding, 'estimated' | 'matured' | 'indexDataMissing' | 'dollarExposure'> {
    return {
        estimated: title.estimated,
        matured: title.matured,
        indexDataMissing: title.indexDataMissing,
        dollarExposure: title.currency === USD_CURRENCY
    };
}

const NO_QUOTE_FIELDS: Pick<
    BareHolding,
    'assetId' | 'market' | 'quantity' | 'quantityDecimals' | 'unitPrice' | 'priceCurrency' | 'missingQuote' | 'stale' | 'isZeroQuantity'
> = {
    assetId: null,
    market: null,
    quantity: null,
    quantityDecimals: null,
    unitPrice: null,
    priceCurrency: null,
    missingQuote: false,
    stale: false,
    isZeroQuantity: false
};

export function titleHolding(title: SourceTitle, context: ValuationContext): BareHolding {
    const valued: ValuedAmount = valueNative(title.valueMinor, title.currency, context.baseCurrency, context.usdRate);
    return {
        kind: HOLDING_KINDS.fixedIncome,
        id: title.id,
        symbol: title.name,
        name: title.name,
        typeGroup: FIXED_INCOME_TYPE_GROUP,
        valueSource: VALUE_SOURCE_BY_PROVIDER[title.source] ?? VALUE_SOURCES.curveCdi,
        priceDate: title.asOf,
        ...NO_QUOTE_FIELDS,
        ...titleFlagsOf(title),
        ...amountsOf(valued, title.currency)
    };
}
