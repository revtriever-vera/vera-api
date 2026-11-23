import { Injectable } from '@nestjs/common';
import { AccountDataExporterPort } from '../../identity/services/account-data-exporter.port';
import { GoalDomain } from '../domain/goal.domain';
import { Goal, GoalHoldingLink } from '../domain/goals.types';

export const GOALS_EXPORT_AREA: string = 'goals';

export interface GoalExport {
    readonly id: string;
    readonly kind: string;
    readonly name: string;
    readonly targetMinor: number;
    readonly targetDate: string;
    readonly holderUserId: string | null;
    readonly manualMinor: number;
    readonly reserveMonths: number | null;
    readonly createdAt: string;
}

export interface GoalHoldingExport {
    readonly goalId: string;
    readonly holdingKind: string;
    readonly holdingId: string;
    readonly shareBps: number;
}

export interface GoalsExport {
    readonly goals: GoalExport[];
    readonly goalHoldings: GoalHoldingExport[];
}

@Injectable()
export class GoalsAccountExporter extends AccountDataExporterPort {
    public readonly area: string = GOALS_EXPORT_AREA;

    public constructor(private readonly goals: GoalDomain) {
        super();
    }

    public async exportAll(): Promise<GoalsExport> {
        const goals: Goal[] = await this.goals.listReal();
        return {
            goals: goals.map((goal: Goal): GoalExport => this.goalOf(goal)),
            goalHoldings: goals.flatMap((goal: Goal): GoalHoldingExport[] =>
                goal.holdings.map((link: GoalHoldingLink): GoalHoldingExport => this.linkOf(goal, link))
            )
        };
    }

    private goalOf(goal: Goal): GoalExport {
        return {
            id: goal.id,
            kind: goal.kind,
            name: goal.name,
            targetMinor: goal.targetMinor,
            targetDate: goal.targetDate,
            holderUserId: goal.holderUserId,
            manualMinor: goal.manualMinor,
            reserveMonths: goal.reserve?.months ?? null,
            createdAt: goal.createdAt.toISOString()
        };
    }

    private linkOf(goal: Goal, link: GoalHoldingLink): GoalHoldingExport {
        return { goalId: goal.id, holdingKind: link.kind, holdingId: link.holdingId, shareBps: link.shareBps };
    }
}
