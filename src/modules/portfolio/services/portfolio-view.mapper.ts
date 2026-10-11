import { sharesBpsOf, targetValueOf } from '../domain/class-summary';
import { deviationStatusOf } from '../domain/deviation-status';
import { ClassSummary, Holding, PortfolioSnapshot } from '../domain/portfolio.types';
import { ClassDetailResponse, HoldingResponse, HoldingsResponse, OverviewResponse } from '../validation/portfolio.schemas';

type BaseCurrency = HoldingsResponse['baseCurrency'];
type ClassBlock = ClassDetailResponse['class'];

function classBlockOf(item: ClassSummary): ClassBlock {
    return {
        classId: item.classId,
        systemKey: item.systemKey,
        name: item.name,
        displayName: item.displayName,
        colorKey: item.colorKey,
        valueMinor: item.valueMinor,
        shareBps: item.shareBps,
        targetBps: item.targetBps,
        deviationBps: item.deviationBps,
        status: item.status,
        gapMinor: item.gapMinor
    };
}

function identityOf(
    holding: Holding
): Pick<HoldingResponse, 'kind' | 'id' | 'assetId' | 'symbol' | 'name' | 'market' | 'typeGroup' | 'classId'> {
    return {
        kind: holding.kind,
        id: holding.id,
        assetId: holding.assetId,
        symbol: holding.symbol,
        name: holding.name,
        market: holding.market as HoldingResponse['market'],
        typeGroup: holding.typeGroup as HoldingResponse['typeGroup'],
        classId: holding.classId
    };
}

function pricingOf(holding: Holding): Pick<HoldingResponse, 'quantity' | 'quantityDecimals' | 'unitPrice' | 'priceCurrency' | 'priceDate'> {
    return {
        quantity: holding.quantity,
        quantityDecimals: holding.quantityDecimals,
        unitPrice: holding.unitPrice,
        priceCurrency: holding.priceCurrency,
        priceDate: holding.priceDate
    };
}

function flagsOf(
    holding: Holding
): Pick<HoldingResponse, 'dollarExposure' | 'missingQuote' | 'stale' | 'estimated' | 'matured' | 'missingRate'> {
    return {
        dollarExposure: holding.dollarExposure,
        missingQuote: holding.missingQuote,
        stale: holding.stale,
        estimated: holding.estimated,
        matured: holding.matured,
        missingRate: holding.missingRate
    };
}

export function toHoldingResponse(holding: Holding): HoldingResponse {
    return {
        ...identityOf(holding),
        ...pricingOf(holding),
        ...flagsOf(holding),
        nativeValueMinor: holding.nativeValueMinor,
        nativeCurrency: holding.nativeCurrency as HoldingResponse['nativeCurrency'],
        valueMinor: holding.valueMinor,
        valueSource: holding.valueSource
    };
}

export function toHoldingsResponse(snapshot: PortfolioSnapshot): HoldingsResponse {
    return {
        baseCurrency: snapshot.baseCurrency as BaseCurrency,
        asOf: snapshot.asOf,
        data: snapshot.holdings.map(toHoldingResponse)
    };
}

export function toOverviewResponse(snapshot: PortfolioSnapshot): OverviewResponse {
    return {
        baseCurrency: snapshot.baseCurrency as BaseCurrency,
        asOf: snapshot.asOf,
        toleranceBps: snapshot.toleranceBps,
        empty: snapshot.empty,
        totalMinor: snapshot.totalMinor,
        unclassifiedMinor: snapshot.unclassifiedMinor,
        dollarExposure: snapshot.dollarExposure,
        usdRate: snapshot.usdRate,
        classes: snapshot.classes.map((item: ClassSummary) => ({ ...classBlockOf(item), holdingsCount: item.holdingsCount })),
        outsideCount: snapshot.outsideCount,
        largestDeviation: snapshot.largestDeviation,
        quality: snapshot.quality
    };
}

function toClassAsset(
    holding: Holding,
    shareInClassBps: number,
    item: ClassSummary,
    toleranceBps: number
): ClassDetailResponse['assets'][number] {
    const deviationBps: number = shareInClassBps - holding.effectiveTargetInClassBps;
    return {
        kind: holding.kind,
        id: holding.id,
        assetId: holding.assetId,
        symbol: holding.symbol,
        name: holding.name,
        valueMinor: holding.valueMinor,
        shareInClassBps,
        targetInClassBps: holding.effectiveTargetInClassBps,
        deviationBps,
        status: deviationStatusOf(deviationBps, toleranceBps),
        gapMinor: targetValueOf(holding.effectiveTargetInClassBps, item.valueMinor) - holding.valueMinor,
        isZeroQuantity: holding.isZeroQuantity,
        missingQuote: holding.missingQuote,
        stale: holding.stale
    };
}

export function toClassDetailResponse(snapshot: PortfolioSnapshot, item: ClassSummary): ClassDetailResponse {
    const members: Holding[] = snapshot.holdings.filter((holding: Holding): boolean => holding.classId === item.classId);
    const shares: number[] = sharesBpsOf(
        members.map((holding: Holding): number => holding.valueMinor),
        item.valueMinor
    );
    return {
        class: classBlockOf(item),
        baseCurrency: snapshot.baseCurrency as BaseCurrency,
        toleranceBps: snapshot.toleranceBps,
        targetsSumBps: members.reduce((sum: number, holding: Holding) => sum + holding.storedTargetInClassBps, 0),
        assets: members.map((holding: Holding, index: number) => toClassAsset(holding, shares[index] ?? 0, item, snapshot.toleranceBps))
    };
}
