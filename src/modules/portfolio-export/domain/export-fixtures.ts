import { ExportHoldingInput, ExportSnapshotInput } from './export.types';

export function holdingOf(overrides: Partial<ExportHoldingInput>): ExportHoldingInput {
    return {
        symbol: 'ITUB4',
        name: 'Itaú Unibanco',
        classId: 'class-br',
        quantity: '2000',
        quantityDecimals: 0,
        valueMinor: 7_560_000,
        valueSource: 'brapi',
        ...overrides
    };
}

export function snapshotOf(holdings: readonly ExportHoldingInput[], baseCurrency: string = 'BRL'): ExportSnapshotInput {
    return {
        baseCurrency,
        holdings,
        classes: [
            { classId: 'class-br', displayName: 'Ações Brasil' },
            { classId: 'class-fi', displayName: 'Renda fixa' }
        ]
    };
}
