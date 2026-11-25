import { POSITION_GROUPS, PositionGroup } from '../investment-statement.types';
import { RawTable } from './b3-cells';
import { ColumnSpec, HeaderMatch, locateHeader } from './b3-columns';
import { FIXED_INCOME_SPEC, FixedIncomeColumn } from './b3-fixed-income.parser';
import { MOVEMENT_SPEC, MovementColumn } from './b3-movement.parser';
import { NEGOTIATION_SPEC, NegotiationColumn } from './b3-negotiation.parser';
import { EQUITY_SPEC, FUND_SPEC, PositionColumn, TREASURY_SPEC } from './b3-position.parser';

export type B3Sheet =
    | { readonly kind: 'negotiation'; readonly table: RawTable; readonly match: HeaderMatch<NegotiationColumn> }
    | { readonly kind: 'movement'; readonly table: RawTable; readonly match: HeaderMatch<MovementColumn> }
    | { readonly kind: 'fixedIncome'; readonly table: RawTable; readonly match: HeaderMatch<FixedIncomeColumn> }
    | {
          readonly kind: 'position';
          readonly table: RawTable;
          readonly match: HeaderMatch<PositionColumn>;
          readonly defaultGroup: PositionGroup;
      };

interface PositionSpec {
    readonly spec: ColumnSpec<PositionColumn>;
    readonly defaultGroup: PositionGroup;
}

const POSITION_SPECS: readonly PositionSpec[] = [
    { spec: FUND_SPEC, defaultGroup: POSITION_GROUPS.fund },
    { spec: EQUITY_SPEC, defaultGroup: POSITION_GROUPS.stock },
    { spec: TREASURY_SPEC, defaultGroup: POSITION_GROUPS.treasury }
];

function detectPosition(table: RawTable): B3Sheet | null {
    for (const candidate of POSITION_SPECS) {
        const match: HeaderMatch<PositionColumn> | null = locateHeader(table.rows, candidate.spec);
        if (match !== null) {
            return { kind: 'position', table, match, defaultGroup: candidate.defaultGroup };
        }
    }
    return null;
}

export function detectB3Sheet(table: RawTable): B3Sheet | null {
    const negotiation: HeaderMatch<NegotiationColumn> | null = locateHeader(table.rows, NEGOTIATION_SPEC);
    if (negotiation !== null) {
        return { kind: 'negotiation', table, match: negotiation };
    }
    const movement: HeaderMatch<MovementColumn> | null = locateHeader(table.rows, MOVEMENT_SPEC);
    if (movement !== null) {
        return { kind: 'movement', table, match: movement };
    }
    const fixedIncome: HeaderMatch<FixedIncomeColumn> | null = locateHeader(table.rows, FIXED_INCOME_SPEC);
    if (fixedIncome !== null) {
        return { kind: 'fixedIncome', table, match: fixedIncome };
    }
    return detectPosition(table);
}
