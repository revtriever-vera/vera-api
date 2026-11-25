import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { FIXED_INCOME_CASES } from './b3-fixed-income';
import { findCpfLikeNumbers, isValidCnpj, isValidCpf } from './document-validation';
import { curveUnitPrice } from './fixed-income-pricing';
import { generateDocumentFixtures, GeneratedFiles } from './generate';
import { readPngSize } from './png-writer';
import { REFERENCE_DATE, SYNTHETIC_HOLDER_CPF } from './synthetic-identity';

const GENERATED_DIR: string = join(__dirname, '..', 'generated');
const FIXTURE_ROOT: string = join(__dirname, '..');
const TEXT_EXTENSIONS: readonly string[] = ['.csv', '.json', '.md', '.ts'];

function listFiles(directory: string): string[] {
    return readdirSync(directory).flatMap((entry: string): string[] => {
        const path: string = join(directory, entry);
        return statSync(path).isDirectory() ? listFiles(path) : [path];
    });
}

async function workbookText(path: string): Promise<string> {
    const workbook: ExcelJS.Workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path);
    const cells: string[] = [];
    workbook.eachSheet((sheet: ExcelJS.Worksheet): void => {
        sheet.eachRow((row: ExcelJS.Row): void => {
            row.eachCell((cell: ExcelJS.Cell): void => {
                cells.push(cell.text);
            });
        });
    });
    return cells.join('\n');
}

async function readableText(path: string): Promise<string | null> {
    const extension: string = extname(path);
    if (extension === '.xlsx') {
        return workbookText(path);
    }
    if (extension === '.pdf') {
        return readFileSync(path, 'latin1');
    }
    return TEXT_EXTENSIONS.includes(extension) ? readFileSync(path, 'utf8') : null;
}

describe('synthetic investment import fixtures', (): void => {
    it('the documented holder CPF fails the check digits', (): void => {
        expect(isValidCpf(SYNTHETIC_HOLDER_CPF)).toBe(false);
    });

    it('no fixture, generator file or README carries a CPF with valid check digits', async (): Promise<void> => {
        const paths: string[] = listFiles(FIXTURE_ROOT);
        const offenders: string[] = [];
        for (const path of paths) {
            const text: string | null = await readableText(path);
            const valid: string[] = findCpfLikeNumbers(text ?? '').filter(isValidCpf);
            valid.forEach((cpf: string): void => {
                offenders.push(`${relative(FIXTURE_ROOT, path)}: ${cpf}`);
            });
        }
        expect(offenders).toEqual([]);
    });

    it('every CNPJ written in the generated reports has invalid check digits', (): void => {
        const text: string = readFileSync(join(GENERATED_DIR, 'b3', 'b3-posicao-acoes.csv'), 'utf8');
        const cnpjs: string[] = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) ?? [];
        expect(cnpjs.length).toBeGreaterThan(0);
        expect(cnpjs.filter(isValidCnpj)).toEqual([]);
    });

    it('the committed files equal what the generator produces', async (): Promise<void> => {
        const generated: GeneratedFiles = await generateDocumentFixtures();
        const committed: string[] = listFiles(GENERATED_DIR)
            .map((path: string): string => relative(GENERATED_DIR, path))
            .filter((name: string): boolean => !name.startsWith('prints'));
        expect(committed.sort()).toEqual([...generated.keys()].sort());
        for (const [name, content] of generated) {
            const extension: string = extname(name);
            const isByteStable: boolean = extension === '.csv' || extension === '.json' || extension === '.pdf';
            if (isByteStable) {
                expect(readFileSync(join(GENERATED_DIR, name)).equals(content)).toBe(true);
            }
        }
    });

    it('the PNG prints are valid images of a phone screen size or a crop of it', (): void => {
        const prints: string[] = listFiles(join(GENERATED_DIR, 'prints'));
        expect(prints).toHaveLength(7);
        prints.forEach((path: string): void => {
            const size: { readonly width: number; readonly height: number } = readPngSize(readFileSync(path));
            expect(size.width).toBeGreaterThan(300);
            expect(size.height).toBeGreaterThan(500);
        });
    });

    it('the fixed income CURVA price follows the declared rate over the fixed series', (): void => {
        const stable: number = curveUnitPrice({ kind: 'pre', annualPercent: 12.3 }, '2025-01-20', REFERENCE_DATE);
        expect(stable).toBeGreaterThan(1200);
        expect(stable).toBeLessThan(1300);
        const higher: number = curveUnitPrice({ kind: 'cdi-percent', percent: 112 }, '2024-03-15', REFERENCE_DATE);
        const lower: number = curveUnitPrice({ kind: 'cdi-percent', percent: 100 }, '2024-03-15', REFERENCE_DATE);
        expect(higher).toBeGreaterThan(lower);
    });

    it('declares every edge case of the fixed income sheet', (): void => {
        const codes: string[] = FIXED_INCOME_CASES.map((item: (typeof FIXED_INCOME_CASES)[number]): string => item.code);
        expect(codes).toEqual(expect.arrayContaining(['CDB-EX-CAREN', 'DEB-EX-JUROS', 'CDB-EX-APLIC', 'CDB-EX-SEMIDX', 'CDB-EX-SEMCURVA']));
        expect(FIXED_INCOME_CASES.filter((item: (typeof FIXED_INCOME_CASES)[number]): boolean => item.indexer === null)).toHaveLength(1);
        expect(FIXED_INCOME_CASES.filter((item: (typeof FIXED_INCOME_CASES)[number]): boolean => !item.curveVisible)).toHaveLength(1);
    });
});
