import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ACCOUNT_MODULES: readonly string[] = ['positions', 'portfolio', 'identity'];
const IMPORT_PATTERN: RegExp = /from\s+'([^']+)'/g;

function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry): string[] => {
        const path: string = join(directory, entry.name);
        if (entry.isDirectory()) {
            return sourceFiles(path);
        }
        return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
    });
}

function importsOf(file: string): string[] {
    return [...readFileSync(file, 'utf8').matchAll(IMPORT_PATTERN)].map((match: RegExpMatchArray): string => match[1] ?? '');
}

describe('market-documents architecture', () => {
    it('imports nothing from the account modules (positions, portfolio, identity)', () => {
        const offenders: string[] = sourceFiles(__dirname).flatMap((file: string): string[] =>
            importsOf(file)
                .filter((specifier: string): boolean =>
                    ACCOUNT_MODULES.some(
                        (name: string): boolean => specifier.includes(`/modules/${name}/`) || specifier.includes(`../${name}/`)
                    )
                )
                .map((specifier: string): string => `${file}: ${specifier}`)
        );

        expect(offenders).toEqual([]);
    });

    it('never names a company in its schema: the table has no companyId', () => {
        const migration: string = readFileSync(join(__dirname, '../../../migrations/20261012880000_create-market-documents.ts'), 'utf8');

        expect(migration).not.toContain('companyId');
    });

    it('has files to check', () => {
        expect(sourceFiles(__dirname).length).toBeGreaterThan(10);
    });
});
