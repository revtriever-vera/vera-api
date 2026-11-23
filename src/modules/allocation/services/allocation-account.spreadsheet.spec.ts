import { describe, expect, it, vi } from 'vitest';
import { makeAssignment, makeClass } from '../../../../test/support/allocation-factories';
import { AppContext } from '../../../core/context/app-context.port';
import { SpreadsheetSheet } from '../../identity/services/account-spreadsheet-exporter.port';
import { AssetClassDomain } from '../domain/asset-class.domain';
import { ClassAssignmentDomain } from '../domain/class-assignment.domain';
import { PortfolioSettingsDomain } from '../domain/portfolio-settings.domain';
import { AllocationAccountSpreadsheet } from './allocation-account.spreadsheet';
import { ClassDisplayNameService } from './class-display-name.service';

function build(settings: unknown, locale: 'pt-BR' | 'en' = 'pt-BR'): AllocationAccountSpreadsheet {
    return new AllocationAccountSpreadsheet(
        {
            listActive: vi
                .fn()
                .mockResolvedValue([
                    makeClass({ id: 'c1', systemKey: 'rf_pos', name: null, targetBps: 6000 }),
                    makeClass({ id: 'c2', name: '=Cripto', targetBps: 4000 })
                ])
        } as unknown as AssetClassDomain,
        {
            listAll: vi
                .fn()
                .mockResolvedValue([
                    makeAssignment({ subjectId: 'real', classId: 'c1', targetInClassBps: 2500 }),
                    makeAssignment({ subjectId: 'sample', classId: 'c1', isSample: true })
                ])
        } as unknown as ClassAssignmentDomain,
        { current: vi.fn().mockResolvedValue(settings) } as unknown as PortfolioSettingsDomain,
        new ClassDisplayNameService(),
        { get: vi.fn().mockReturnValue({ requestId: 'r', locale }) } as unknown as AppContext
    );
}

async function rowsOf(sheet: SpreadsheetSheet): Promise<unknown[]> {
    const rows: unknown[] = [];
    for await (const row of sheet.rows) {
        rows.push(row);
    }
    return rows;
}

describe('AllocationAccountSpreadsheet', () => {
    it('writes classes, per-asset targets (without samples) and settings into metas, in the session locale', async () => {
        const sheets: readonly SpreadsheetSheet[] = await build({ baseCurrency: 'USD', toleranceBps: 300 }).sheets();

        expect(sheets.map((sheet: SpreadsheetSheet) => [sheet.file, sheet.name])).toEqual([
            ['metas', 'Classes'],
            ['metas', 'Metas por ativo'],
            ['metas', 'Preferências']
        ]);
        expect(await rowsOf(sheets[0] as SpreadsheetSheet)).toEqual([
            ['Renda fixa pós', { value: 0.6, numFmt: '0.00%' }],
            ["'=Cripto", { value: 0.4, numFmt: '0.00%' }]
        ]);
        expect(await rowsOf(sheets[1] as SpreadsheetSheet)).toEqual([
            ['Posição', 'real', 'Renda fixa pós', { value: 0.25, numFmt: '0.00%' }]
        ]);
        expect(await rowsOf(sheets[2] as SpreadsheetSheet)).toEqual([
            ['Moeda base', 'USD'],
            ['Tolerância', { value: 0.03, numFmt: '0.00%' }]
        ]);
    });

    it('uses the defaults when no preferences were saved and english labels for an english session', async () => {
        const sheets: readonly SpreadsheetSheet[] = await build(null, 'en').sheets();

        expect((sheets[2] as SpreadsheetSheet).name).toBe('Settings');
        expect(await rowsOf(sheets[2] as SpreadsheetSheet)).toEqual([
            ['Base currency', 'BRL'],
            ['Tolerance', { value: 0.05, numFmt: '0.00%' }]
        ]);
    });
});
