import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AskVeraToolKind } from '../domain/ask-vera.types';
import { AskVeraToolPort, PaidFeature } from './ask-vera-tool.port';
import { AskVeraToolRegistry } from './ask-vera-tool.registry';

class FakeTool extends AskVeraToolPort {
    public readonly inputSchema = z.object({});

    public constructor(
        public readonly name: string,
        public readonly feature: PaidFeature,
        public readonly kind: AskVeraToolKind
    ) {
        super();
    }

    public description(): string {
        return this.name;
    }

    public run(): Promise<{ payload: Record<string, never> }> {
        return Promise.resolve({ payload: {} });
    }
}

describe('AskVeraToolRegistry', () => {
    it('só oferece ferramenta cuja feature está disponível, em ordem de nome', async () => {
        const tools: FakeTool[] = [
            new FakeTool('reminder_create', 'whatsapp', 'proposal'),
            new FakeTool('calendar_list_events', 'calendar', 'direct'),
            new FakeTool('a_read', 'whatsapp', 'read')
        ];
        const registry: AskVeraToolRegistry = new AskVeraToolRegistry(
            { getProviders: () => [...tools.map((instance) => ({ instance })), { instance: {} }] } as never,
            { allows: (feature: PaidFeature) => Promise.resolve(feature === 'whatsapp') } as never
        );
        const allowed: ReadonlySet<string> = new Set(['a_read', 'reminder_create', 'calendar_list_events']);
        expect((await registry.available(allowed)).map((tool) => tool.name)).toEqual(['a_read', 'reminder_create']);
        expect((await registry.available(new Set(['reminder_create']))).map((tool) => tool.name)).toEqual(['reminder_create']);
        expect(registry.all().map((tool) => tool.name)).toEqual(['a_read', 'calendar_list_events', 'reminder_create']);
    });
});
