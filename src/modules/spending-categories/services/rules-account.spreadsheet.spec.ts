import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { SpreadsheetSheet } from '../../identity/services/account-spreadsheet-exporter.port';
import { CategoryRuleDomain } from '../domain/category-rule.domain';
import { SpendingCategoryDomain } from '../domain/spending-category.domain';
import { RulesAccountSpreadsheet } from './rules-account.spreadsheet';

function rule(overrides: Record<string, unknown>): Record<string, unknown> {
    return { label: 'Petz', matchType: 'contains', pattern: 'petz', appliesTo: 'out', categoryId: 'cat-1', isSample: false, ...overrides };
}

function build(locale: 'pt-BR' | 'en' = 'pt-BR'): RulesAccountSpreadsheet {
    return new RulesAccountSpreadsheet(
        {
            listActive: vi.fn().mockResolvedValue([
                { id: 'cat-1', name: 'Pets', systemKey: null },
                { id: 'cat-2', name: null, systemKey: 'housing' }
            ])
        } as unknown as SpendingCategoryDomain,
        {
            listActive: vi.fn().mockResolvedValue([
                rule({}),
                rule({
                    label: '=cmd',
                    matchType: 'counterparty',
                    pattern: 'chave-do-favorecido',
                    categoryId: 'cat-2',
                    appliesTo: 'any'
                }),
                rule({ label: 'exemplo', isSample: true })
            ])
        } as unknown as CategoryRuleDomain,
        { get: vi.fn().mockReturnValue({ requestId: 'r', locale }) } as unknown as AppContext
    );
}

describe('RulesAccountSpreadsheet', () => {
    it('lists the rules without samples, protects formula text and hides the counterparty key', async () => {
        const sheets: readonly SpreadsheetSheet[] = await build().sheets();
        const rows: unknown[] = [];
        for await (const row of (sheets[0] as SpreadsheetSheet).rows) {
            rows.push(row);
        }

        expect((sheets[0] as SpreadsheetSheet).file).toBe('regras');
        expect((sheets[0] as SpreadsheetSheet).name).toBe('Regras de categoria');
        expect(rows).toEqual([
            ['Petz', 'Descrição contém', 'petz', 'Saídas', 'Pets'],
            ["'=cmd", 'Favorecido', '', 'Entradas e saídas', 'housing']
        ]);
    });

    it('names the sheet and the headers in the session locale', async () => {
        const sheet: SpreadsheetSheet = (await build('en').sheets())[0] as SpreadsheetSheet;

        expect(sheet.name).toBe('Category rules');
        expect(sheet.columns.map((column) => column.header)).toEqual(['Rule', 'Match type', 'Text', 'Applies to', 'Category']);
    });
});
