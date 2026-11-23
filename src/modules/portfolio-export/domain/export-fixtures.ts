import { ExportHoldingInput, ExportIssuerInput, ExportSnapshotInput } from './export.types';

export function holdingOf(overrides: Partial<ExportHoldingInput>): ExportHoldingInput {
    return {
        symbol: 'ITUB4',
        name: 'Itaú Unibanco',
        classId: 'class-br',
        titleKind: null,
        issuerId: null,
        quantity: '2000',
        quantityDecimals: 0,
        valueMinor: 7_560_000,
        valueSource: 'brapi',
        holderUserId: null,
        ...overrides
    };
}

export function snapshotOf(holdings: readonly ExportHoldingInput[], baseCurrency: string = 'BRL'): ExportSnapshotInput {
    return {
        baseCurrency,
        issuers: new Map<string, ExportIssuerInput>([['banco-inter', { name: 'Banco Inter', groupName: 'Inter&Co' }]]),
        holders: new Map<string, string>(),
        holdings,
        classes: [
            { classId: 'class-br', displayName: 'Ações Brasil' },
            { classId: 'class-fi', displayName: 'Renda fixa' }
        ]
    };
}
