import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterAll, describe, it } from 'vitest';
import { moduleMockInSpec, noSharedStateWrite, noStaticState } from './process-state.mjs';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({ languageOptions: { parser: tsParser, sourceType: 'module' } });

tester.run('no-static-state', noStaticState, {
    valid: [
        'class A { private static readonly slot: Frozen<B> = new Frozen(); }',
        'class A { private static readonly names: Frozen<string> = new Frozen(); }',
        "class A { private static readonly LIMIT: number = 3; private static readonly KEYS: readonly string[] = ['a']; }",
        'class A { private value: B | null = null; private readonly cache: Map<string, B> = new Map(); }'
    ],
    invalid: [
        { code: 'class A { private static value: B | null = null; }', errors: [{ messageId: 'mutable' }] },
        { code: 'class A { static count = 0; }', errors: [{ messageId: 'mutable' }] },
        { code: 'class A { private static readonly seen: Map<string, B> = new Map(); }', errors: [{ messageId: 'collection' }] },
        { code: 'class A { private static readonly seen: Set<string> = new Set(); }', errors: [{ messageId: 'collection' }] }
    ]
});

tester.run('no-shared-state-write', noSharedStateWrite, {
    valid: [
        "vi.stubEnv('IS_LOCAL', 'true');",
        "vi.stubGlobal('fetch', fetcher);",
        "const local: string | undefined = process.env['IS_LOCAL'];",
        'const env = { ...process.env, A: "1" }; env.A = "2";',
        'Object.assign(target, process.env);',
        "Reflect.get(process.env, 'IS_LOCAL');",
        "Reflect.deleteProperty(target, 'IS_LOCAL');"
    ],
    invalid: [
        { code: "process.env['IS_LOCAL'] = 'true';", errors: [{ messageId: 'env' }] },
        { code: "process.env.IS_LOCAL = 'true';", errors: [{ messageId: 'env' }] },
        { code: "delete process.env['IS_LOCAL'];", errors: [{ messageId: 'env' }] },
        { code: 'process.env = { ...saved };', errors: [{ messageId: 'env' }] },
        { code: "Object.assign(process.env, { A: '1' });", errors: [{ messageId: 'env' }] },
        { code: "process.env['DATABASE_URL'] ??= 'postgres://';", errors: [{ messageId: 'env' }] },
        { code: "Reflect.deleteProperty(process.env, 'IS_LOCAL');", errors: [{ messageId: 'env' }] },
        { code: 'globalThis.fetch = fetcher;', errors: [{ messageId: 'global' }] },
        { code: "Reflect.set(globalThis, 'fetch', fetcher);", errors: [{ messageId: 'global' }] },
        { code: "Object.defineProperty(globalThis, 'crypto', { value: fake });", errors: [{ messageId: 'global' }] },
        { code: 'Service.prototype.run = fake;', errors: [{ messageId: 'prototype' }] },
        { code: 'Service.prototype = other;', errors: [{ messageId: 'prototype' }] },
        { code: 'Object.defineProperty(Service.prototype, "run", { value: fake });', errors: [{ messageId: 'prototype' }] }
    ]
});

tester.run('module-mock-in-spec', moduleMockInSpec, {
    valid: ["vi.fn(); vi.spyOn(a, 'b');", "other.mock('./a');"],
    invalid: [
        { code: "vi.mock('./a');", errors: [{ messageId: 'found' }] },
        { code: "vi.doMock('./a', () => ({}));", errors: [{ messageId: 'found' }] }
    ]
});
