import { join } from 'node:path';
import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterAll, describe, it } from 'vitest';
import { noReimplementation } from './no-reimplementation.mjs';
import registry from './single-sources.json' with { type: 'json' };

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({ languageOptions: { parser: tsParser } });

const OWNER = 'src/modules/bank-connections/services/sync-failure.rules.ts';
const SOURCES = {
    sources: [
        {
            rule: 'recusa definitiva',
            owner: OWNER,
            exports: ['permanentRefusalOf'],
            patterns: [{ what: 'lista de status', kind: 'array', includes: [400, 404, 422] }]
        },
        {
            rule: 'parado',
            owner: 'src/modules/positions/services/position-activity.rules.ts',
            exports: ['lastActivityOf', 'isStalledAfter'],
            patterns: [
                { what: 'última atividade', kind: 'array', includes: ['lastActivityAt', 'stageEnteredAt'] },
                { what: 'parado', kind: 'computed', names: ['stalled'] }
            ]
        },
        {
            rule: 'busca sem acento',
            owner: 'src/core/database/full-text-search.ts',
            exports: ['containsIgnoringAccents'],
            patterns: [
                { what: 'unaccent', kind: 'text', match: 'unaccent\\s*\\(', files: '^src/' },
                { what: 'ilike', kind: 'text', match: '\\bilike\\b', files: '/repositories/' }
            ],
            frozen: ['src/modules/catalog/repositories/assets.repository.ts']
        }
    ]
};

const at = (path) => join(process.cwd(), path);
const options = [SOURCES];
const found = (owner, exports, what, rule) => ({ messageId: 'found', data: { owner, exports, what, rule } });
const refusal = found(OWNER, 'permanentRefusalOf', 'lista de status', 'recusa definitiva');

tester.run('no-reimplementation', noReimplementation, {
    valid: [
        { code: 'const s = new Set([400, 404, 409, 422]);', filename: at(OWNER), options },
        { code: 'const s = new Set([400, 404, 409]);', filename: at('src/modules/billing/services/engine.ts'), options },
        { code: 'const s = new Set([408, 429, 500]);', filename: at('src/core/llm/drivers/openai.ts'), options },
        {
            code: 'const at = latestOf([position.lastActivityAt, state?.lastConversationAt]);',
            filename: at('src/modules/positions/services/radar.rules.ts'),
            options
        },
        {
            code: 'const view = { stalled: isStalledAfter(days, window, false), lastActivityAt: position.lastActivityAt };',
            filename: at('src/modules/positions/services/view.ts'),
            options
        },
        { code: 'const stalled = reading.stalled;', filename: at('src/modules/positions/services/view.ts'), options },
        { code: "query.where('name', 'ilike', pattern);", filename: at('src/modules/catalog/repositories/assets.repository.ts'), options },
        { code: "query.where('name', 'ilike', pattern);", filename: at('src/modules/positions/services/search.ts'), options },
        { code: 'const q = sql`unaccent(${column})`;', filename: at('migrations/2026-01-01-search.ts'), options },
        {
            code: "const q = sql`unaccent(coalesce(${column}, '')) ilike unaccent(${pattern})`;",
            filename: at('src/core/database/full-text-search.ts'),
            options
        },
        { code: 'const s = new Set([400, 404, 422]);', filename: at('src/modules/reports/services/probe.ts'), options: [{ sources: [] }] }
    ],
    invalid: [
        {
            code: 'const s = new Set([400, 404, 409, 422]);',
            filename: at('src/modules/reports/services/qa-probe-refusal.ts'),
            options,
            errors: [refusal]
        },
        { code: 'const s = [422, 400, 404];', filename: at('src/modules/review/application/sync.ts'), options, errors: [refusal] },
        {
            code: 'const at = latestOf([position.lastActivityAt?.getTime(), position.stageEnteredAt!]);',
            filename: at('src/modules/indicators/services/activity.ts'),
            options,
            errors: [
                found(
                    'src/modules/positions/services/position-activity.rules.ts',
                    'lastActivityOf, isStalledAfter',
                    'última atividade',
                    'parado'
                )
            ]
        },
        {
            code: 'const view = { stalled: days > window && next === null };',
            filename: at('src/modules/positions/services/view.ts'),
            options,
            errors: [
                found('src/modules/positions/services/position-activity.rules.ts', 'lastActivityOf, isStalledAfter', 'parado', 'parado')
            ]
        },
        {
            code: 'const stalled = !next && days > window;',
            filename: at('src/modules/positions/services/view.ts'),
            options,
            errors: [
                found('src/modules/positions/services/position-activity.rules.ts', 'lastActivityOf, isStalledAfter', 'parado', 'parado')
            ]
        },
        {
            code: "query.where('name', 'ilike', pattern);",
            filename: at('src/modules/accounts/repositories/accounts.repository.ts'),
            options,
            errors: [found('src/core/database/full-text-search.ts', 'containsIgnoringAccents', 'ilike', 'busca sem acento')]
        },
        {
            code: 'const q = sql`unaccent(${column}) ilike ${pattern}`;',
            filename: at('src/modules/accounts/repositories/accounts.repository.ts'),
            options,
            errors: [
                found('src/core/database/full-text-search.ts', 'containsIgnoringAccents', 'unaccent', 'busca sem acento'),
                found('src/core/database/full-text-search.ts', 'containsIgnoringAccents', 'ilike', 'busca sem acento')
            ]
        },
        {
            code: 'const q = sql`select unaccent(${text})`;',
            filename: at('src/modules/search/services/search.ts'),
            options,
            errors: [found('src/core/database/full-text-search.ts', 'containsIgnoringAccents', 'unaccent', 'busca sem acento')]
        }
    ]
});

tester.run('no-reimplementation com o registro do repositório', noReimplementation, {
    valid: [
        { code: 'const pattern = `%${text}%`;', filename: at('src/shared/utils/like.util.ts'), options: [registry] },
        { code: 'const pattern = `${text}%`;', filename: at('src/modules/catalog/repositories/assets.repository.ts'), options: [registry] },
        {
            code: 'const pattern = likePattern(text);',
            filename: at('src/modules/transactions/repositories/a.repository.ts'),
            options: [registry]
        }
    ],
    invalid: [
        {
            code: 'const pattern = `%${text}%`;',
            filename: at('src/modules/transactions/repositories/a.repository.ts'),
            options: [registry],
            errors: 2
        }
    ]
});
