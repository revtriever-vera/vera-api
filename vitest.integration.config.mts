import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const REDIS_LOGICAL_DATABASES: number = 16;

export default defineConfig({
    resolve: {
        alias: {
            '@src': fileURLToPath(new URL('./src', import.meta.url))
        }
    },
    test: {
        include: ['test/integration/**/*.int-spec.ts'],
        environment: 'node',
        globals: false,
        passWithNoTests: true,
        globalSetup: ['./test/integration/global-setup.ts'],
        pool: 'forks',
        poolOptions: { forks: { maxForks: REDIS_LOGICAL_DATABASES } },
        testTimeout: 30_000,
        hookTimeout: 60_000,
        coverage: {
            provider: 'v8',
            include: ['src/**'],
            exclude: [
                '**/*.spec.ts',
                '**/*.module.ts',
                'src/main.ts',
                'src/tracing.ts',
                'src/core/database/generated/**',
                'src/shared/pagination/pagination.types.ts'
            ],
            reportsDirectory: 'coverage/integration',
            reporter: ['text-summary', 'json-summary', 'json', 'html', 'lcov']
        }
    },
    plugins: [
        swc.vite({
            module: { type: 'es6' },
            jsc: {
                target: 'es2022',
                parser: { syntax: 'typescript', decorators: true },
                transform: { legacyDecorator: true, decoratorMetadata: true }
            }
        })
    ]
});
