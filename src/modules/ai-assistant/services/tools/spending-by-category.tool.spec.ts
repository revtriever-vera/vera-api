import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../../core/context/app-context.port';
import { SpendingCategory } from '../../../spending-categories/services/category-reader.service';
import { MonthlyCategoryNet } from '../../../transactions/services/transaction-aggregates.service';
import { SpendingByCategoryTool } from './spending-by-category.tool';

function category(id: string, systemKey: string | null, name: string | null): SpendingCategory {
    return { id, systemKey, name, kind: 'expense' } as unknown as SpendingCategory;
}

function net(month: string, categoryId: string | null, netMinor: number): MonthlyCategoryNet {
    return { month, categoryId, netMinor, outflowMinor: netMinor, outflowCount: 1, transactionCount: 1 };
}

function build(rows: MonthlyCategoryNet[]) {
    const monthlyNetByCategory = vi.fn().mockResolvedValue(rows);
    const tool: SpendingByCategoryTool = new SpendingByCategoryTool(
        { listForCompany: vi.fn().mockResolvedValue([category('c1', 'eating_out', null), category('c2', null, 'Pets')]) } as never,
        { monthlyNetByCategory } as never,
        { get: () => ({ locale: 'pt-BR' }) } as unknown as AppContext
    );
    return { tool, monthlyNetByCategory };
}

describe('SpendingByCategoryTool', () => {
    it('limita o período a 12 meses', () => {
        const { tool } = build([]);
        expect(tool.inputSchema.safeParse({ fromMonth: '2026-01', toMonth: '2026-12' }).success).toBe(true);
        expect(tool.inputSchema.safeParse({ fromMonth: '2025-12', toMonth: '2026-12' }).success).toBe(false);
        expect(tool.inputSchema.safeParse({ fromMonth: '2026-05', toMonth: '2026-04' }).success).toBe(false);
        expect(tool.inputSchema.safeParse({ fromMonth: '2026-5', toMonth: '2026-06' }).success).toBe(false);
    });

    it('devolve totais por mês e categoria, sem lançamento individual nem companyId', async () => {
        const { tool, monthlyNetByCategory } = build([
            net('2026-09', 'c1', -32000),
            net('2026-10', 'c1', -1000),
            net('2026-09', 'c2', -500)
        ]);
        const output = await tool.run({ categoryKey: 'eating_out', fromMonth: '2026-09', toMonth: '2026-10' });
        expect(monthlyNetByCategory).toHaveBeenCalledWith({ fromMonth: '2026-09', toMonth: '2026-10' });
        expect(output.payload).toEqual({
            periodo: { de: '2026-09', ate: '2026-10' },
            categorias: [
                {
                    chave: 'eating_out',
                    rotulo_padrao: 'Delivery e restaurantes',
                    total: expect.stringContaining('330'),
                    meses: [
                        { mes: '2026-09', total: expect.stringContaining('320') },
                        { mes: '2026-10', total: expect.stringContaining('10') }
                    ]
                }
            ]
        });
        expect(output.numbers).toEqual(expect.arrayContaining([330, 320, 10]));
        expect(JSON.stringify(output.payload)).not.toMatch(/companyId|description/);
    });

    it('sem categoryKey traz só as categorias com gasto, e o sem categoria entra', async () => {
        const { tool } = build([net('2026-09', 'c2', -500), net('2026-09', null, -700)]);
        const output = await tool.run({ fromMonth: '2026-09', toMonth: '2026-09' });
        expect(JSON.stringify(output.payload)).toContain('custom_1');
        expect(JSON.stringify(output.payload)).toContain('sem_categoria');
        expect(JSON.stringify(output.payload)).not.toContain('eating_out');
    });

    it('avisa o modelo de chave desconhecida', async () => {
        const { tool } = build([]);
        const output = await tool.run({ categoryKey: 'nope', fromMonth: '2026-09', toMonth: '2026-09' });
        expect(output.payload).toEqual({ error: 'unknown category key; use list_categories' });
    });
});
