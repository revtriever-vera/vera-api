import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { SONAR_MAIN_RULES, sonarPlugin } from './sonar-plugin.mjs';

const KEYS = ['sonar/S3358', 'sonar/S3863', 'sonar/S2871'];

const FIXTURE = `
import { first } from './a';
import { second } from './a';

export function grade(score: number): string {
    return score > 8 ? 'high' : score > 4 ? 'mid' : 'low';
}

export function ordered(values: number[]): number[] {
    return values.sort();
}

export const used = [first, second];
`;

const PROJECT_DIR = import.meta.dirname + '/sonar-gate-project';

async function lintOf(source) {
    const eslint = new ESLint({
        cwd: PROJECT_DIR,
        overrideConfigFile: true,
        overrideConfig: [
            {
                files: ['**/*.ts'],
                languageOptions: {
                    parser: tseslint.parser,
                    parserOptions: { projectService: { allowDefaultProject: ['*.ts'] }, tsconfigRootDir: PROJECT_DIR }
                },
                plugins: { sonar: sonarPlugin },
                rules: Object.fromEntries(KEYS.map((key) => [key, SONAR_MAIN_RULES[key]]))
            }
        ]
    });
    const [result] = await eslint.lintText(source, { filePath: 'sonar-gate-fixture.ts' });
    return result.messages.map((message) => message.ruleId);
}

describe('the Sonar way rules in the lint', () => {
    it('are configured as errors for the main code', () => {
        for (const key of KEYS) {
            expect(SONAR_MAIN_RULES[key][0]).toBe('error');
        }
    });

    it('fail on a nested ternary, a duplicate import and a sort without comparator', async () => {
        const rules = await lintOf(FIXTURE);

        expect(rules).toEqual(expect.arrayContaining(KEYS));
    });

    it('pass on the same code written the Sonar way', async () => {
        const clean = `
import { first, second } from './a';

export function grade(score: number): string {
    if (score > 8) {
        return 'high';
    }
    return score > 4 ? 'mid' : 'low';
}

export function ordered(values: number[]): number[] {
    return values.toSorted((left, right) => left - right);
}

export const used = [first, second];
`;

        expect(await lintOf(clean)).toEqual([]);
    });
});
