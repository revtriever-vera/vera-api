import { compareCodeUnits } from '../../../shared/utils/compare-code-units';
import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { calendarDaysBetween, ReferenceRates } from '../../fixed-income/services/index-series-math';
import { projectTitle, projectTreasury } from './maturity-projection';
import {
    HOLDING_KINDS,
    MaturityItem,
    Projection,
    REALLOCATE_STEP_MINOR,
    ScheduleInputs,
    ScheduleTitle,
    ScheduleTreasury,
    SOON_DAYS
} from './schedule.types';

const USD: string = 'USD';

interface Converted {
    readonly valueMinor: number;
    readonly estimated: boolean;
}

function toBrl(projection: Projection, currency: string, usdRate: string | null): Converted {
    if (currency !== USD) {
        return { valueMinor: projection.valueMinor, estimated: projection.estimated };
    }
    if (usdRate === null) {
        return { valueMinor: 0, estimated: true };
    }
    return { valueMinor: DecimalUtil.roundHalfUpToInteger(DecimalUtil.of(projection.valueMinor).times(usdRate)), estimated: true };
}

export function reallocatableMinor(valueMinor: number): number {
    return Math.floor(Math.max(valueMinor, 0) / REALLOCATE_STEP_MINOR) * REALLOCATE_STEP_MINOR;
}

function itemOf(
    base: Pick<MaturityItem, 'holdingKind' | 'id' | 'name' | 'issuerName' | 'kind' | 'maturityDate' | 'taxRegime' | 'isSample'>,
    projection: Projection,
    converted: Converted,
    today: string
): MaturityItem {
    const daysToMaturity: number = calendarDaysBetween(today, base.maturityDate);
    return {
        ...base,
        daysToMaturity,
        soon: daysToMaturity <= SOON_DAYS,
        estimatedValueMinor: converted.valueMinor,
        currency: 'BRL',
        reallocateMinor: reallocatableMinor(converted.valueMinor),
        estimated: converted.estimated,
        basis: projection.basis
    };
}

function titleItem(title: ScheduleTitle, inputs: ScheduleInputs, rates: ReferenceRates): MaturityItem {
    const projection: Projection = projectTitle(title, inputs.today, rates);
    return itemOf(
        {
            holdingKind: HOLDING_KINDS.fixedIncome,
            id: title.id,
            name: title.name,
            issuerName: title.issuerName,
            kind: title.kind,
            maturityDate: title.maturityDate,
            taxRegime: title.taxRegime,
            isSample: title.isSample
        },
        projection,
        toBrl(projection, title.currency, inputs.usdRate),
        inputs.today
    );
}

function treasuryItem(treasury: ScheduleTreasury, inputs: ScheduleInputs, rates: ReferenceRates): MaturityItem | null {
    const projection: Projection | null = projectTreasury(treasury, inputs.today, rates);
    if (projection === null) {
        return null;
    }
    return itemOf(
        {
            holdingKind: HOLDING_KINDS.position,
            id: treasury.id,
            name: treasury.name,
            issuerName: null,
            kind: null,
            maturityDate: treasury.maturityDate,
            taxRegime: null,
            isSample: treasury.isSample
        },
        projection,
        { valueMinor: projection.valueMinor, estimated: projection.estimated },
        inputs.today
    );
}

function byMaturity(left: MaturityItem, right: MaturityItem): number {
    return (
        compareCodeUnits(left.maturityDate, right.maturityDate) ||
        compareCodeUnits(left.name, right.name) ||
        compareCodeUnits(left.id, right.id)
    );
}

export function buildMaturities(inputs: ScheduleInputs, rates: ReferenceRates, limit: number): MaturityItem[] {
    const fromTitles: MaturityItem[] = inputs.titles
        .filter((title: ScheduleTitle): boolean => title.maturityDate >= inputs.today)
        .map((title: ScheduleTitle): MaturityItem => titleItem(title, inputs, rates));
    const fromTreasuries: MaturityItem[] = inputs.treasuries
        .filter((treasury: ScheduleTreasury): boolean => treasury.maturityDate >= inputs.today)
        .flatMap((treasury: ScheduleTreasury): MaturityItem[] => {
            const item: MaturityItem | null = treasuryItem(treasury, inputs, rates);
            return item === null ? [] : [item];
        });
    return [...fromTitles, ...fromTreasuries].sort(byMaturity).slice(0, limit);
}
