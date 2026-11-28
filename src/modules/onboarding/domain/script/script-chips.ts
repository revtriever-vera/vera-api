import { ScriptChip } from './script.types';

const PORTFOLIO_CHIP: ScriptChip = {
    id: 'modules.portfolio',
    label: 'Meus investimentos',
    action: { type: 'CHOOSE_MODULES', portfolio: true, spending: false }
};

const SPENDING_CHIP: ScriptChip = {
    id: 'modules.spending',
    label: 'Meus gastos',
    action: { type: 'CHOOSE_MODULES', portfolio: false, spending: true }
};

const BOTH_CHIP: ScriptChip = {
    id: 'modules.both',
    label: 'Os dois',
    action: { type: 'CHOOSE_MODULES', portfolio: true, spending: true }
};

const EXPLAIN_CHIP: ScriptChip = { id: 'modules.explain', label: 'Ainda não sei', quiet: true, action: { type: 'EXPLAIN' } };

export const DASHBOARD_CHIP: ScriptChip = { id: 'dashboard', label: 'Ir para o painel', action: { type: 'GO_DASHBOARD' } };

export function moduleChips(withExplain: boolean): readonly ScriptChip[] {
    const choices: readonly ScriptChip[] = [PORTFOLIO_CHIP, SPENDING_CHIP, BOTH_CHIP];
    if (!withExplain) {
        return choices;
    }
    return [...choices, EXPLAIN_CHIP];
}
