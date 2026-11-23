import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { ANY_HOLDER } from '../../../shared/holder/holder-filter';
import { spreadsheetSafeText } from '../../../shared/spreadsheet/spreadsheet-safe-text';
import { currencyFormatOf, XlsxCell, XlsxColumn } from '../../../shared/spreadsheet/xlsx';
import { AccountSpreadsheetExporterPort, SpreadsheetSheet } from '../../identity/services/account-spreadsheet-exporter.port';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { DirectoryMember, MemberDirectoryService } from '../../identity/services/member-directory.service';
import { PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { GOALS_SPREADSHEET_LABELS, GoalsSpreadsheetLabels } from '../domain/goals-spreadsheet-labels';
import { GoalDomain } from '../domain/goal.domain';
import { BPS_BASE, Goal } from '../domain/goals.types';
import { GoalView } from '../validation/goals.schemas';
import { HoldingIndex, indexHoldings, toGoalView } from './goal-view.mapper';

export const GOALS_SPREADSHEET_FILE: string = 'objetivos';

const PERCENT_FORMAT: string = '0.00%';
const MONEY_FORMAT: string = currencyFormatOf('BRL');
const MINOR_PER_UNIT: number = 100;

function column(header: string, width: number, type: XlsxColumn['type'] = 'text'): XlsxColumn {
    return { header, type, width };
}

function moneyOf(minor: number): XlsxCell {
    return { value: minor / MINOR_PER_UNIT, numFmt: MONEY_FORMAT };
}

@Injectable()
export class GoalsAccountSpreadsheet extends AccountSpreadsheetExporterPort {
    public readonly name: string = 'goals';

    public constructor(
        private readonly goals: GoalDomain,
        private readonly snapshots: PortfolioSnapshotService,
        private readonly members: MemberDirectoryService,
        private readonly timezones: CompanyTimezoneService,
        private readonly context: AppContext
    ) {
        super();
    }

    public async sheets(): Promise<readonly SpreadsheetSheet[]> {
        const labels: GoalsSpreadsheetLabels = GOALS_SPREADSHEET_LABELS[this.context.get().locale];
        const goals: Goal[] = await this.goals.listReal();
        const views: GoalView[] = await this.viewsOf(goals);
        const holders: Map<string, string> = new Map(
            (await this.members.list()).map((member: DirectoryMember): [string, string] => [member.userId, member.name])
        );
        return [this.goalsSheet(goals, views, holders, labels), this.linksSheet(views, labels)];
    }

    private async viewsOf(goals: readonly Goal[]): Promise<GoalView[]> {
        const today: string = await this.timezones.todayInCompany();
        const holdings: HoldingIndex = indexHoldings(await this.snapshots.build(ANY_HOLDER));
        return goals.map((goal: Goal): GoalView => toGoalView(goal, holdings, today));
    }

    private goalsSheet(
        goals: readonly Goal[],
        views: readonly GoalView[],
        holders: ReadonlyMap<string, string>,
        labels: GoalsSpreadsheetLabels
    ): SpreadsheetSheet {
        return {
            file: GOALS_SPREADSHEET_FILE,
            name: labels.goals.sheet,
            columns: [
                column(labels.goals.name, 30),
                column(labels.goals.kind, 24),
                column(labels.goals.target, 18, 'number'),
                column(labels.goals.date, 14, 'date'),
                column(labels.goals.balance, 18, 'number'),
                column(labels.goals.status, 16),
                column(labels.goals.holder, 24)
            ],
            rows: goals.map((goal: Goal, index: number): XlsxCell[] => this.goalRow(goal, views[index] as GoalView, holders, labels))
        };
    }

    private goalRow(goal: Goal, view: GoalView, holders: ReadonlyMap<string, string>, labels: GoalsSpreadsheetLabels): XlsxCell[] {
        const holder: string = goal.holderUserId === null ? labels.wholeAccount : (holders.get(goal.holderUserId) ?? '');
        return [
            spreadsheetSafeText(goal.name),
            labels.kinds[goal.kind] ?? goal.kind,
            moneyOf(goal.targetMinor),
            new Date(`${goal.targetDate}T00:00:00Z`),
            moneyOf(view.balanceMinor),
            labels.statuses[view.status] ?? view.status,
            spreadsheetSafeText(holder)
        ];
    }

    private linksSheet(views: readonly GoalView[], labels: GoalsSpreadsheetLabels): SpreadsheetSheet {
        return {
            file: GOALS_SPREADSHEET_FILE,
            name: labels.links.sheet,
            columns: [column(labels.links.goal, 30), column(labels.links.asset, 40), column(labels.links.share, 12, 'number')],
            rows: views.flatMap((view: GoalView): XlsxCell[][] =>
                view.holdings.map((link): XlsxCell[] => [
                    spreadsheetSafeText(view.name),
                    spreadsheetSafeText(link.name ?? link.symbol ?? link.holdingId),
                    { value: link.shareBps / BPS_BASE, numFmt: PERCENT_FORMAT }
                ])
            )
        };
    }
}
