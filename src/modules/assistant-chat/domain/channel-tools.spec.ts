import { describe, expect, it } from 'vitest';
import { APP_AI_TOOLS, APP_HELP_TOOLS, appToolsOf } from './channel-tools';

describe('ferramentas do app por modo', () => {
    it('help só recebe as de ajuda, sem nenhuma ferramenta de número', () => {
        expect([...appToolsOf('help')].sort()).toEqual(['data_locked', 'help_search', 'where_is']);
        expect(appToolsOf('help')).toBe(APP_HELP_TOOLS);
        expect(appToolsOf('help').has('market_benchmarks')).toBe(false);
    });

    it('ai recebe as de ajuda e as de leitura, com as ferramentas de concentração, vencimentos e indicadores de mercado, e nada de agenda nem lembrete', () => {
        expect([...appToolsOf('ai')].sort()).toEqual([
            'concentration_overview',
            'contribution_suggestion',
            'fixed_income_maturities',
            'goals_overview',
            'help_search',
            'list_categories',
            'market_benchmarks',
            'portfolio_overview',
            'recurring_overview',
            'spending_by_category',
            'spending_cuts',
            'spending_month_summary',
            'where_is'
        ]);
        expect(appToolsOf('ai')).toBe(APP_AI_TOOLS);
        expect([...APP_AI_TOOLS].some((tool: string): boolean => /calendar|reminder/.test(tool))).toBe(false);
    });
});
