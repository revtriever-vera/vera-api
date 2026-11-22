import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterAll, describe, it } from 'vitest';
import { clientEscape, repositoryEscape } from './repository-escape.mjs';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({ languageOptions: { parser: tsParser, sourceType: 'module' } });

tester.run('repository-escape', repositoryEscape, {
    valid: [
        "import { Kysely } from 'kysely'; class A { a() { return this.findAll({}); } }",
        "import { sql } from 'other'; class A {}",
        'class A { a() { return this.query(); } }'
    ],
    invalid: [
        { code: 'class A { a() { return this.db.selectFrom(x); } }', errors: [{ messageId: 'db' }] },
        { code: 'class A { a() { return this.database.withTransaction(f); } }', errors: [{ messageId: 'database' }] },
        { code: 'class A { a() { return this.database.executor; } }', errors: [{ messageId: 'executor' }] },
        { code: "import { Kysely, sql } from 'kysely';", errors: [{ messageId: 'sql' }] },
        { code: 'class A { a() { return this.unscopedFind({}); } }', errors: [{ messageId: 'unscoped' }] },
        { code: 'class A { a() { return this.unscopedQueryWith({}); } }', errors: [{ messageId: 'unscoped' }] },
        { code: 'class A { a() { return this.unscopedInsertQuery(); } }', errors: [{ messageId: 'unscoped' }] },
        { code: "class A { a() { return this.unscopedAliasedFrom('Positions', 'p', {}); } }", errors: [{ messageId: 'unscoped' }] }
    ]
});

tester.run('client-escape', clientEscape, {
    valid: ['class A { a() { return this.database.withTransaction(f); } }', 'class A { a() { return this.database.afterCommit(f); } }'],
    invalid: [{ code: 'class A { a() { return this.database.executor; } }', errors: [{ messageId: 'executor' }] }]
});
