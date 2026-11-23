import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AlsAppContext } from '../../../core/context/als-app-context';
import { ContextHolder } from '../../../core/context/as-company.decorator';
import { LlmCallsHistoryService } from '../../../core/llm/services/llm-calls-history.service';
import { LLM_CALLS_ERASE_AREA, LlmCallsAccountEraser } from './llm-calls-account.eraser';

describe('LlmCallsAccountEraser', () => {
    beforeAll(() => {
        ContextHolder.set(new AlsAppContext());
    });

    it('apaga o registro de chamadas da company e devolve quantas', async () => {
        const history = { eraseAll: vi.fn().mockResolvedValue(4) };
        const eraser: LlmCallsAccountEraser = new LlmCallsAccountEraser(history as unknown as LlmCallsHistoryService);

        expect(eraser.area).toBe(LLM_CALLS_ERASE_AREA);
        const context: AlsAppContext = new AlsAppContext();
        ContextHolder.set(context);

        const erased: number = await context.run({ requestId: 'r', locale: 'pt-BR' }, async () => eraser.eraseAll('company-1'));

        expect(erased).toBe(4);
    });
});
