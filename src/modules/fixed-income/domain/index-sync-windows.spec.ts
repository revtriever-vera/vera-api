import { describe, expect, it } from 'vitest';
import { planSyncWindows } from './index-sync-windows';

describe('planSyncWindows', () => {
    it('sem nenhum ponto faz o backfill desde 2010-01-01 em janelas de um ano', () => {
        const windows = planSyncWindows(null, '2012-03-15');

        expect(windows).toEqual([
            { from: '2010-01-01', to: '2010-12-31' },
            { from: '2011-01-01', to: '2011-12-31' },
            { from: '2012-01-01', to: '2012-03-15' }
        ]);
    });

    it('com pontos busca do último ponto até hoje numa janela só', () => {
        expect(planSyncWindows('2026-10-08', '2026-10-11')).toEqual([{ from: '2026-10-08', to: '2026-10-11' }]);
    });

    it('divide por ano quando o último ponto é antigo', () => {
        expect(planSyncWindows('2025-11-10', '2026-02-01')).toEqual([
            { from: '2025-11-10', to: '2025-12-31' },
            { from: '2026-01-01', to: '2026-02-01' }
        ]);
    });

    it('último ponto de hoje ainda gera a janela do dia', () => {
        expect(planSyncWindows('2026-10-11', '2026-10-11')).toEqual([{ from: '2026-10-11', to: '2026-10-11' }]);
    });

    it('nunca começa antes de 2010 nem depois de hoje', () => {
        expect(planSyncWindows('2005-05-05', '2010-01-02')).toEqual([{ from: '2010-01-01', to: '2010-01-02' }]);
        expect(planSyncWindows('2030-01-01', '2026-10-11')).toEqual([{ from: '2026-10-11', to: '2026-10-11' }]);
    });
});
