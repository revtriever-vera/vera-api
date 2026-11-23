import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { AppLocale } from '../../../shared/i18n/locale';
import { spreadsheetSafeText } from '../../../shared/spreadsheet/spreadsheet-safe-text';
import { XlsxCell, XlsxColumn } from '../../../shared/spreadsheet/xlsx';
import { AccountSpreadsheetExporterPort, SpreadsheetSheet } from '../../identity/services/account-spreadsheet-exporter.port';
import { AssetClassDomain } from '../domain/asset-class.domain';
import { ClassAssignmentDomain } from '../domain/class-assignment.domain';
import { PortfolioSettingsDomain } from '../domain/portfolio-settings.domain';
import { ALLOCATION_SPREADSHEET_LABELS, AllocationSpreadsheetLabels } from '../domain/allocation-spreadsheet-labels';
import {
    AssetClass,
    ClassAssignment,
    DEFAULT_BASE_CURRENCY,
    DEFAULT_TOLERANCE_BPS,
    PortfolioSettingsRow
} from '../domain/allocation.types';
import { ClassDisplayNameService } from './class-display-name.service';

export const ALLOCATION_SPREADSHEET_FILE: string = 'metas';

const PERCENT_FORMAT: string = '0.00%';
const BPS_PER_UNIT: number = 10_000;

function percentOf(bps: number): XlsxCell {
    return { value: bps / BPS_PER_UNIT, numFmt: PERCENT_FORMAT };
}

function column(header: string, width: number, type: XlsxColumn['type'] = 'text'): XlsxColumn {
    return { header, type, width };
}

@Injectable()
export class AllocationAccountSpreadsheet extends AccountSpreadsheetExporterPort {
    public readonly name: string = 'allocation';

    public constructor(
        private readonly classes: AssetClassDomain,
        private readonly assignments: ClassAssignmentDomain,
        private readonly settings: PortfolioSettingsDomain,
        private readonly names: ClassDisplayNameService,
        private readonly context: AppContext
    ) {
        super();
    }

    public async sheets(): Promise<readonly SpreadsheetSheet[]> {
        const locale: AppLocale = this.context.get().locale;
        const labels: AllocationSpreadsheetLabels = ALLOCATION_SPREADSHEET_LABELS[locale];
        const classes: AssetClass[] = await this.classes.listActive();
        const assignments: ClassAssignment[] = (await this.assignments.listAll()).filter(
            (assignment: ClassAssignment): boolean => !assignment.isSample
        );
        const settings: PortfolioSettingsRow | null = await this.settings.current();
        return [
            this.classesSheet(classes, labels, locale),
            this.assetsSheet(assignments, classes, labels, locale),
            this.settingsSheet(settings, labels)
        ];
    }

    private classesSheet(classes: readonly AssetClass[], labels: AllocationSpreadsheetLabels, locale: AppLocale): SpreadsheetSheet {
        return {
            file: ALLOCATION_SPREADSHEET_FILE,
            name: labels.classes.sheet,
            columns: [column(labels.classes.name, 30), column(labels.classes.target, 16, 'number')],
            rows: classes.map((item: AssetClass): XlsxCell[] => [
                spreadsheetSafeText(this.names.nameOf(item, locale)),
                percentOf(item.targetBps)
            ])
        };
    }

    private assetsSheet(
        assignments: readonly ClassAssignment[],
        classes: readonly AssetClass[],
        labels: AllocationSpreadsheetLabels,
        locale: AppLocale
    ): SpreadsheetSheet {
        const classNames: Map<string, string> = new Map<string, string>(
            classes.map((item: AssetClass): [string, string] => [item.id, this.names.nameOf(item, locale)])
        );
        return {
            file: ALLOCATION_SPREADSHEET_FILE,
            name: labels.assets.sheet,
            columns: [
                column(labels.assets.kind, 18),
                column(labels.assets.asset, 40),
                column(labels.assets.className, 30),
                column(labels.assets.target, 22, 'number')
            ],
            rows: assignments.map((assignment: ClassAssignment): XlsxCell[] => [
                labels.subjectTypes[assignment.subjectType] ?? assignment.subjectType,
                assignment.subjectId,
                spreadsheetSafeText(classNames.get(assignment.classId) ?? ''),
                percentOf(assignment.targetInClassBps)
            ])
        };
    }

    private settingsSheet(settings: PortfolioSettingsRow | null, labels: AllocationSpreadsheetLabels): SpreadsheetSheet {
        return {
            file: ALLOCATION_SPREADSHEET_FILE,
            name: labels.settings.sheet,
            columns: [column(labels.settings.setting, 24), column(labels.settings.value, 16)],
            rows: [
                [labels.settings.baseCurrency, settings?.baseCurrency ?? DEFAULT_BASE_CURRENCY],
                [labels.settings.tolerance, percentOf(settings?.toleranceBps ?? DEFAULT_TOLERANCE_BPS)]
            ]
        };
    }
}
