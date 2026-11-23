import { ClassInput, HoldingInput, UNMAPPED_SECTOR } from './concentration.types';

const EQUITY_CLASS_KEYS: ReadonlySet<string> = new Set<string>(['acoes_br', 'acoes_eua', 'fii', 'reits']);

type ClassRef = ClassInput;

function isEquityHolding(holding: HoldingInput, classes: ReadonlyMap<string, ClassRef>): boolean {
    const assigned: ClassRef | undefined = holding.classId === null ? undefined : classes.get(holding.classId);
    if (assigned?.systemKey !== null && assigned?.systemKey !== undefined) {
        return EQUITY_CLASS_KEYS.has(assigned.systemKey);
    }
    return EQUITY_CLASS_KEYS.has(holding.typeGroup);
}

export function sectorKeyOf(holding: HoldingInput, classes: ReadonlyMap<string, ClassRef>): string | null {
    if (!isEquityHolding(holding, classes)) {
        return null;
    }
    return holding.sector ?? UNMAPPED_SECTOR;
}
