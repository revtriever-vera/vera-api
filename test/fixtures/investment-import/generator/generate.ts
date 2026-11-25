import { buildB3Reports } from './b3-reports';
import { buildCryptoExports } from './crypto-exports';
import { buildFixedIncomeExpectations } from './b3-fixed-income';
import { buildB3PositionPdf } from './b3-pdf';
import { buildBrokerageNotes } from './brokerage-notes';
import { buildBrokerScreens, ScreenFile } from './broker-screens';
import { sheetToCsv } from './csv-writer';
import { encodePng } from './png-writer';
import { ReportFile, SheetTable } from './sheet.types';
import { reportToXlsx } from './xlsx-writer';

export type GeneratedFiles = ReadonlyMap<string, Buffer>;

const PDF_SLUGS: readonly string[] = ['acoes', 'etf', 'fundo-de-investimento', 'renda-fixa'];

function csvFiles(report: ReportFile): [string, Buffer][] {
    return report.sheets.map((sheet: SheetTable): [string, Buffer] => {
        const suffix: string = report.sheets.length === 1 ? '' : `-${sheet.slug}`;
        return [`b3/${report.baseName}${suffix}.csv`, sheetToCsv(sheet)];
    });
}

async function reportFiles(report: ReportFile): Promise<[string, Buffer][]> {
    return [[`b3/${report.baseName}.xlsx`, await reportToXlsx(report)], ...csvFiles(report)];
}

function positionPdf(reports: readonly ReportFile[]): [string, Buffer][] {
    const sheets: SheetTable[] = reports.flatMap((report: ReportFile): readonly SheetTable[] => report.sheets);
    const selected: SheetTable[] = sheets.filter((sheet: SheetTable): boolean => PDF_SLUGS.includes(sheet.slug));
    return [['b3/b3-posicao.pdf', buildB3PositionPdf(selected)]];
}

function expectationFile(): [string, Buffer][] {
    const json: string = `${JSON.stringify(buildFixedIncomeExpectations(), null, 2)}\n`;
    return [['b3/b3-renda-fixa.expected.json', Buffer.from(json, 'utf8')]];
}

function screenFiles(): [string, Buffer][] {
    return buildBrokerScreens().map((screen: ScreenFile): [string, Buffer] => [`prints/${screen.name}.png`, encodePng(screen.raster)]);
}

export async function generateDocumentFixtures(): Promise<GeneratedFiles> {
    const reports: ReportFile[] = buildB3Reports();
    const perReport: [string, Buffer][][] = await Promise.all(reports.map(reportFiles));
    return new Map<string, Buffer>([
        ...perReport.flat(),
        ...positionPdf(reports),
        ...expectationFile(),
        ...buildCryptoExports(),
        ...buildBrokerageNotes()
    ]);
}

export async function generateAllFixtures(): Promise<GeneratedFiles> {
    const documents: GeneratedFiles = await generateDocumentFixtures();
    return new Map<string, Buffer>([...documents, ...screenFiles()]);
}
