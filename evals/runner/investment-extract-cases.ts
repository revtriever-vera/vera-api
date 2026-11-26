import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { noteCaseSchema } from './note-case.schemas';
import { ParsedInvestmentStatement, ParsedOperation } from '../../src/modules/investment-import/domain/investment-statement.types';
import { specsOfModelAnswers, statementOfModelAnswers } from '../../src/modules/investment-import/domain/model/model-statement';
import { parseSecuritySpec, pickBySecuritySpec, SpecCandidate } from '../../src/modules/investment-import/domain/model/security-spec';

export const NOTE_CASES_TODAY: string = '2026-11-25';

const CASES_DIR: string = join(__dirname, '..', 'cases', 'investment_extract');
const REPO_ROOT: string = join(__dirname, '..', '..');

export { noteCaseSchema };

export type NoteCase = z.infer<typeof noteCaseSchema>;

export function noteCasesOf(): NoteCase[] {
    return readdirSync(CASES_DIR)
        .filter((name: string): boolean => name.endsWith('.json') && name !== 'catalog.json')
        .sort()
        .map((name: string): NoteCase => noteCaseSchema.parse(JSON.parse(readFileSync(join(CASES_DIR, name), 'utf8'))));
}

export function noteCatalogOf(): SpecCandidate[] {
    return z
        .array(z.object({ symbol: z.string(), name: z.string(), kind: z.string() }))
        .parse(JSON.parse(readFileSync(join(CASES_DIR, 'catalog.json'), 'utf8')));
}

export function noteFileOf(item: NoteCase): Buffer {
    return readFileSync(join(REPO_ROOT, item.file));
}

export function tickersBySpecOf(answers: readonly string[], catalog: readonly SpecCandidate[]): Map<string, string> {
    const resolved: Map<string, string> = new Map();
    for (const spec of specsOfModelAnswers(answers)) {
        const parsed: ReturnType<typeof parseSecuritySpec> = parseSecuritySpec(spec);
        const ticker: string | null = parsed === null ? null : pickBySecuritySpec(parsed, catalog);
        if (ticker !== null) {
            resolved.set(spec, ticker);
        }
    }
    return resolved;
}

export function statementOfNoteAnswer(answer: string, catalog: readonly SpecCandidate[]): ParsedInvestmentStatement {
    return statementOfModelAnswers([answer], {
        labels: ['text'],
        unreadPages: [],
        today: NOTE_CASES_TODAY,
        tickersBySpec: tickersBySpecOf([answer], catalog)
    });
}

function lineOf(operation: ParsedOperation): Record<string, unknown> {
    return {
        ticker: operation.ticker,
        kind: operation.kind,
        quantity: operation.quantity,
        unitPrice: operation.unitPrice,
        grossMinor: operation.grossMinor,
        feesMinor: operation.feesMinor,
        ...(operation.check === undefined ? {} : { check: operation.check })
    };
}

export function problemsOfNoteStatement(item: NoteCase, statement: ParsedInvestmentStatement): string[] {
    const problems: string[] = [];
    const lines: string = JSON.stringify(statement.operations.map(lineOf));
    if (lines !== JSON.stringify(item.expected.lines)) {
        problems.push(`lines differ: got ${lines}`);
    }
    const ignored: string = JSON.stringify(statement.ignored.map((line): string => line.reason));
    if (ignored !== JSON.stringify(item.expected.ignored.map((line): string => line.reason))) {
        problems.push(`ignored differ: got ${ignored}`);
    }
    if (JSON.stringify(statement.notes) !== JSON.stringify(item.expected.notes)) {
        problems.push(`notes differ: got ${JSON.stringify(statement.notes)}`);
    }
    if (statement.rejected.length > 0) {
        problems.push(`${String(statement.rejected.length)} line(s) rejected`);
    }
    return problems;
}
