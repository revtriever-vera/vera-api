import { compareCodeUnits, minCodeUnits } from '../../../shared/utils/compare-code-units';
import { DecimalUtil, mulDecimal, toMinor } from '../../../shared/utils/decimal.util';
import type { MaturityItem } from '../../fixed-income-schedule/services/maturities-reader.service';
import type { Position } from '../../positions/services/position-reader.service';
import type { PortfolioEventView } from '../../portfolio-events/services/portfolio-events-reader.service';
import { AGENDA_FIXED_INCOME_MATURITY, AGENDA_TREASURY_MATURITY, AgendaItem, AgendaWindow } from './portfolio-agenda.types';

function inside(date: string | null, window: AgendaWindow): date is string {
    return date !== null && date >= window.from && date <= window.to;
}

function keyDateOf(event: PortfolioEventView, window: AgendaWindow): string {
    const dates: string[] = [event.exDate, event.paymentDate, event.eventDate].filter((date: string | null): date is string =>
        inside(date, window)
    );
    return dates.reduce((earliest: string, date: string): string => minCodeUnits(earliest, date), dates[0] ?? window.from);
}

function amountForAccountOf(event: PortfolioEventView, quantity: string): number | null {
    return event.amountPerUnit === null ? null : toMinor(mulDecimal(quantity, event.amountPerUnit), event.currency);
}

export function quantityByAsset(positions: readonly Position[]): Map<string, string> {
    const totals: Map<string, ReturnType<typeof DecimalUtil.of>> = new Map();
    for (const position of positions) {
        totals.set(position.assetId, (totals.get(position.assetId) ?? DecimalUtil.of(0)).add(position.quantity));
    }
    return new Map(
        [...totals].map(([assetId, total]: [string, ReturnType<typeof DecimalUtil.of>]): [string, string] => [assetId, total.toFixed()])
    );
}

export function eventAgendaItem(event: PortfolioEventView, name: string, quantity: string, window: AgendaWindow): AgendaItem {
    return {
        id: event.id,
        kind: event.kind,
        assetId: event.assetId,
        holdingId: null,
        name,
        date: keyDateOf(event, window),
        exDate: event.exDate,
        paymentDate: event.paymentDate,
        eventDate: event.eventDate,
        amountPerUnit: event.amountPerUnit === null ? null : DecimalUtil.of(event.amountPerUnit).toFixed(),
        currency: event.currency,
        amountForAccountMinor: amountForAccountOf(event, quantity),
        estimated: true,
        documentUrl: event.documentUrl
    };
}

export function maturityAgendaItem(item: MaturityItem): AgendaItem {
    return {
        id: item.id,
        kind: item.holdingKind === 'fixed_income' ? AGENDA_FIXED_INCOME_MATURITY : AGENDA_TREASURY_MATURITY,
        assetId: null,
        holdingId: item.id,
        name: item.name,
        date: item.maturityDate,
        exDate: null,
        paymentDate: null,
        eventDate: item.maturityDate,
        amountPerUnit: null,
        currency: item.currency,
        amountForAccountMinor: item.estimatedValueMinor,
        estimated: true,
        documentUrl: null
    };
}

export function insideWindow(date: string, window: AgendaWindow): boolean {
    return inside(date, window);
}

export function byAgendaOrder(left: AgendaItem, right: AgendaItem): number {
    return compareCodeUnits(`${left.date}|${left.name}|${left.kind}|${left.id}`, `${right.date}|${right.name}|${right.kind}|${right.id}`);
}
