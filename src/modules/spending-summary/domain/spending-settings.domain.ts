import { Injectable } from '@nestjs/common';
import { SpendingSettingsRepository, UpdateSettingsData } from '../repositories/spending-settings.repository';
import { DeclaredIncomeRequiredError } from './spending-summary.errors';
import { INCOME_MODES, IncomeMode, SpendingSettingsRow, SpendingSettingsView } from './spending-summary.types';

export interface SettingsChange {
    readonly savingsGoalBps?: number;
    readonly incomeMode?: IncomeMode;
    readonly declaredIncomeMinor?: number | null;
}

export function toSettingsView(row: SpendingSettingsRow): SpendingSettingsView {
    return {
        savingsGoalBps: row.savingsGoalBps,
        incomeMode: row.incomeMode === INCOME_MODES.declared ? INCOME_MODES.declared : INCOME_MODES.transactions,
        declaredIncomeMinor: row.declaredIncomeMinor === null ? null : Number(row.declaredIncomeMinor)
    };
}

@Injectable()
export class SpendingSettingsDomain {
    public constructor(private readonly settings: SpendingSettingsRepository) {}

    public async current(): Promise<SpendingSettingsRow | null> {
        return this.settings.findCurrent();
    }

    public async ensure(): Promise<SpendingSettingsRow> {
        const current: SpendingSettingsRow | null = await this.settings.findCurrent();
        if (current !== null) {
            return current;
        }
        await this.settings.insertDefaultIfMissing();
        return (await this.settings.findCurrent()) as SpendingSettingsRow;
    }

    public async update(change: SettingsChange): Promise<SpendingSettingsRow> {
        const current: SpendingSettingsRow = await this.ensure();
        const view: SpendingSettingsView = toSettingsView(current);
        const mode: IncomeMode = change.incomeMode ?? view.incomeMode;
        const requested: number | null = change.declaredIncomeMinor === undefined ? view.declaredIncomeMinor : change.declaredIncomeMinor;
        const declaredIncomeMinor: number | null = requested !== null && requested > 0 ? requested : null;
        if (mode === INCOME_MODES.declared && declaredIncomeMinor === null) {
            throw new DeclaredIncomeRequiredError();
        }
        const data: UpdateSettingsData = {
            savingsGoalBps: change.savingsGoalBps ?? view.savingsGoalBps,
            incomeMode: mode,
            declaredIncomeMinor
        };
        return (await this.settings.updateFields(current.id, data)) ?? current;
    }
}
