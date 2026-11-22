import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterAll, describe, it } from 'vitest';
import { skillSourceImport } from './skill-source-import.mjs';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({ languageOptions: { parser: tsParser, sourceType: 'module' } });

const ALLOWED = [
    {
        sources: [
            { source: '@acme/skills', names: ['CORE_SKILLS'] },
            { suffix: '/skill-catalog', names: ['CATALOG_SKILLS', 'DEVELOPER_SKILLS'] }
        ],
        allowed: { 'src/a/named.ts': 'named exception' }
    }
];

tester.run('skill-source-import', skillSourceImport, {
    valid: [
        { code: "import { readSkills } from '@acme/skills';", filename: 'src/b/other.ts', options: ALLOWED },
        { code: "import { CORE_SKILLS } from '@acme/skills';", filename: 'src/a/named.ts', options: ALLOWED },
        { code: "import { CATALOG_SKILLS } from './skill-catalog';", filename: 'src/core/prompt/inside.ts', options: ALLOWED },
        { code: "import { OTHER } from './skill-catalog';", filename: 'src/b/other.ts', options: ALLOWED },
        { code: "import { CORE_SKILLS } from '@acme/skills';", filename: 'src/b/other.ts', options: [{ sources: [] }] }
    ],
    invalid: [
        {
            code: "import { CORE_SKILLS } from '@acme/skills';",
            filename: 'src/b/other.ts',
            options: ALLOWED,
            errors: [{ messageId: 'found' }]
        },
        {
            code: "import { CATALOG_SKILLS } from '../prompt/skill-catalog';",
            filename: 'src/b/other.ts',
            options: ALLOWED,
            errors: [{ messageId: 'found' }]
        },
        {
            code: "import { CATALOG_SKILLS, DEVELOPER_SKILLS } from './skill-catalog';",
            filename: 'src/b/other.ts',
            options: ALLOWED,
            errors: [{ messageId: 'found' }, { messageId: 'found' }]
        }
    ]
});
