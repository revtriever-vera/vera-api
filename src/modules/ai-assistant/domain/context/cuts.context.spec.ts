import { describe, expect, it } from 'vitest';
import type { CutsResult } from '../../../spending-cuts/services/spending-cuts.service';
import { buildCutsContext, cutsStatusOf } from './cuts.context';

describe('contexto de cortes', () => {
    it('traduz o status e recusa os estados sem dados para o modelo', () => {
        expect(cutsStatusOf('goal_met')).toBe('meta_batida');
        expect(cutsStatusOf('cut_suggested')).toBe('possivel');
        expect(cutsStatusOf('exceeds_flexible')).toBe('so_cortar_nao_resolve');
        expect(cutsStatusOf('no_data')).toBeNull();
        expect(cutsStatusOf('no_income')).toBeNull();
    });

    it('não monta contexto quando não há dados ou renda', () => {
        const empty = { status: 'no_income', goal: { bps: 2000 }, suggestions: [] } as unknown as CutsResult;

        expect(buildCutsContext(empty, 'pt-BR')).toBeNull();
    });
});
