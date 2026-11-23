import { describe, expect, it, vi } from 'vitest';
import { LlmCallDomain } from '../domain/llm-call.domain';
import { LlmCallsHistoryService } from './llm-calls-history.service';

describe('LlmCallsHistoryService', () => {
    it('apaga as chamadas da company', async () => {
        const calls = { eraseAll: vi.fn().mockResolvedValue(3) };

        expect(await new LlmCallsHistoryService(calls as unknown as LlmCallDomain).eraseAll()).toBe(3);
    });

    it('a retenção apaga o que tem mais de 13 meses', async () => {
        const calls = { purgeBefore: vi.fn().mockResolvedValue(5) };

        const purged: number = await new LlmCallsHistoryService(calls as unknown as LlmCallDomain).purgeExpired(
            new Date('2026-11-15T12:00:00Z')
        );

        expect(purged).toBe(5);
        expect(calls.purgeBefore).toHaveBeenCalledWith(new Date('2025-10-15T12:00:00Z'));
    });
});
