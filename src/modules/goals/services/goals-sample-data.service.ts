import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { AppLocale } from '../../../shared/i18n/locale';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { SampleDataPort } from '../../onboarding/services/sample-data.port';
import { firstOfMonth, monthOf, planMonthsBetween } from '../domain/goal-calculator';
import { GoalDomain } from '../domain/goal.domain';
import { GOAL_KINDS, GoalKind, NewGoalData } from '../domain/goals.types';

export const GOALS_SAMPLE_AREA: string = 'goals';

const SAMPLE_NAMES: Readonly<Record<AppLocale, { readonly reserve: string; readonly travel: string }>> = {
    'pt-BR': { reserve: 'Reserva de emergência', travel: 'Viagem' },
    en: { reserve: 'Emergency reserve', travel: 'Trip' }
};

interface SampleShape {
    readonly kind: GoalKind;
    readonly targetMinor: number;
    readonly balanceMinor: number;
    readonly startedMonthsAgo: number;
    readonly monthsAhead: number;
}

/** The reserve is on track (it started at today's balance); the trip started months ago and is far behind its plan. */
const RESERVE_SHAPE: SampleShape = {
    kind: GOAL_KINDS.emergencyReserve,
    targetMinor: 3_000_000,
    balanceMinor: 1_800_000,
    startedMonthsAgo: 0,
    monthsAhead: 12
};
const TRAVEL_SHAPE: SampleShape = {
    kind: GOAL_KINDS.travel,
    targetMinor: 1_200_000,
    balanceMinor: 200_000,
    startedMonthsAgo: 3,
    monthsAhead: 3
};

@Injectable()
export class GoalsSampleDataService extends SampleDataPort {
    public readonly area: string = GOALS_SAMPLE_AREA;

    public constructor(
        private readonly goals: GoalDomain,
        private readonly timezones: CompanyTimezoneService,
        private readonly context: AppContext
    ) {
        super();
    }

    public async seed(): Promise<number> {
        if ((await this.goals.countAll()) > 0) {
            return 0;
        }
        const today: string = await this.timezones.todayInCompany();
        const names: { readonly reserve: string; readonly travel: string } = SAMPLE_NAMES[this.context.get().locale];
        await this.goals.create(this.dataOf(RESERVE_SHAPE, names.reserve, today), []);
        await this.goals.create(this.dataOf(TRAVEL_SHAPE, names.travel, today), []);
        return 2;
    }

    public async clear(): Promise<number> {
        return this.goals.removeSamples();
    }

    private dataOf(shape: SampleShape, name: string, today: string): NewGoalData {
        const targetDate: string = `${monthOf(today, shape.monthsAhead)}-15`;
        const startMonth: string = `${monthOf(today, -shape.startedMonthsAgo)}-01`;
        return {
            kind: shape.kind,
            name,
            targetMinor: shape.targetMinor,
            targetDate,
            holderUserId: null,
            manualMinor: shape.balanceMinor,
            plan: { startMonth, startMinor: shape.balanceMinor, months: planMonthsBetween(startMonth, targetDate) },
            monthStart: { month: firstOfMonth(today), minor: shape.balanceMinor },
            reserve: null,
            isSample: true
        };
    }
}
