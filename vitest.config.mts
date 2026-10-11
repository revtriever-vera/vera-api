import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.spec.ts', 'scripts/**/*.spec.ts', 'infra/**/*.spec.ts'],
        environment: 'node',
        maxWorkers: 4,
        globals: false,
        passWithNoTests: true,
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
            reportsDirectory: 'coverage/unit',
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
