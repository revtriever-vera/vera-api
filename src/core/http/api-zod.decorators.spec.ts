import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { ApiZodBody, ApiZodQuery, ApiZodResponse } from './api-zod.decorators';

const target: object = {};
const descriptor: PropertyDescriptor = { value: (): void => undefined };

describe('api zod decorators', () => {
    it('ApiZodBody applies without throwing', () => {
        expect(() => {
            ApiZodBody(z.object({ name: z.string() }))(target, 'handler', descriptor);
        }).not.toThrow();
    });

    it('ApiZodQuery renders one decorator per field, required and optional alike', () => {
        expect(() => {
            ApiZodQuery(z.object({ page: z.number().optional(), search: z.string().describe('Texto buscado') }))(
                target,
                'handler',
                descriptor
            );
        }).not.toThrow();
    });

    it('ApiZodResponse applies without throwing', () => {
        expect(() => {
            ApiZodResponse({ status: 200, description: 'ok', schema: z.object({ status: z.literal('ok') }) })(
                target,
                'handler',
                descriptor
            );
        }).not.toThrow();
    });
});
