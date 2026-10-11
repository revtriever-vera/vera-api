import { INestApplication } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger';
import { describe, expect, it, vi } from 'vitest';
import { AppConfig } from './config/app.config';

const state: { createDocumentCalls: unknown[][]; setupCalls: unknown[][] } = vi.hoisted(() => ({
    createDocumentCalls: [],
    setupCalls: []
}));

vi.mock('@nestjs/swagger', async (importOriginal: () => Promise<Record<string, unknown>>) => {
    const actual: Record<string, unknown> = await importOriginal();
    return {
        ...actual,
        SwaggerModule: {
            createDocument: (...args: unknown[]): OpenAPIObject => {
                state.createDocumentCalls.push(args);
                return {} as OpenAPIObject;
            },
            setup: (...args: unknown[]): void => {
                state.setupCalls.push(args);
            }
        }
    };
});

function fakeApp(): { app: INestApplication; use: ReturnType<typeof vi.fn> } {
    const use: ReturnType<typeof vi.fn> = vi.fn();
    return { app: { use } as unknown as INestApplication, use };
}

function configOf(): AppConfig {
    return { SWAGGER_USER: 'admin', SWAGGER_PASSWORD: 'secret' } as AppConfig;
}

describe('setupSwagger', () => {
    it('protects the docs paths with basic auth and serves the generated document', async () => {
        const { setupSwagger } = await import('./swagger');
        const { app, use } = fakeApp();

        setupSwagger(app, configOf());

        expect(use).toHaveBeenCalledWith(['/docs', '/docs-json', '/docs-yaml'], expect.any(Function));
        expect(state.createDocumentCalls).toHaveLength(1);
        expect(state.setupCalls[0]?.[0]).toBe('docs');
    });
});
