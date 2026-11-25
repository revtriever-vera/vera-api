import { describe, expect, it } from 'vitest';
import { LlmUnknownTaskError } from '../llm.errors';
import { LlmTaskRegistryService } from './llm-task-registry.service';

describe('LlmTaskRegistryService', () => {
    it('resolve a tarefa do catálogo e lista todas', () => {
        const registry: LlmTaskRegistryService = new LlmTaskRegistryService();

        expect(registry.resolve('summary_month').task).toBe('summary_month');
        expect(registry.list()).toHaveLength(5);
    });

    it('tarefa desconhecida é erro de programação (500)', () => {
        const registry: LlmTaskRegistryService = new LlmTaskRegistryService();

        expect(() => registry.resolve('nope')).toThrow(LlmUnknownTaskError);
        expect(() => registry.resolve('nope')).toThrow(expect.objectContaining({ code: 'ai.unknown_task', status: 500 }) as Error);
    });
});
