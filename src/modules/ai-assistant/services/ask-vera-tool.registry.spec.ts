import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AskRoute } from '../domain/ask-channel-profiles';
import { AskVeraToolKind } from '../domain/ask-vera.types';
import { AskVeraToolFeature, AskVeraToolPort, PaidFeature } from './ask-vera-tool.port';
import { AskVeraToolRegistry } from './ask-vera-tool.registry';

const WHATSAPP_ROUTE: AskRoute = { channel: 'whatsapp', feature: 'whatsapp' };

class FakeTool extends AskVeraToolPort {
    public readonly inputSchema = z.object({});

    public constructor(
        public readonly name: string,
        public readonly feature: AskVeraToolFeature,
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
        expect((await registry.available(allowed, WHATSAPP_ROUTE)).map((tool) => tool.name)).toEqual(['a_read', 'reminder_create']);
        expect((await registry.available(new Set(['reminder_create']), WHATSAPP_ROUTE)).map((tool) => tool.name)).toEqual([
            'reminder_create'
        ]);
        expect(registry.all().map((tool) => tool.name)).toEqual(['a_read', 'calendar_list_events', 'reminder_create']);
    });

    it('oferece a ferramenta de ajuda sem consultar o plano', async () => {
        const consulted: string[] = [];
        const registry: AskVeraToolRegistry = new AskVeraToolRegistry(
            {
                getProviders: () => [
                    { instance: new FakeTool('help_search', 'help', 'read') },
                    { instance: new FakeTool('a_read', 'whatsapp', 'read') }
                ]
            } as never,
            {
                allows: (feature: PaidFeature) => {
                    consulted.push(feature);
                    return Promise.resolve(false);
                }
            } as never
        );
        const offered = await registry.available(new Set(['help_search', 'a_read']), WHATSAPP_ROUTE);
        expect(offered.map((tool) => tool.name)).toEqual(['help_search']);
        expect(consulted).toEqual(['whatsapp']);
    });

    it('no app em modo ai, a ferramenta de leitura divide o plano da IA, não o do WhatsApp', async () => {
        const consulted: string[] = [];
        const registry: AskVeraToolRegistry = new AskVeraToolRegistry(
            { getProviders: () => [{ instance: new FakeTool('a_read', 'whatsapp', 'read') }] } as never,
            {
                allows: (feature: PaidFeature) => {
                    consulted.push(feature);
                    return Promise.resolve(feature === 'ai');
                }
            } as never
        );
        const offered = await registry.available(new Set(['a_read']), { channel: 'app', feature: 'ai' });
        expect(offered.map((tool) => tool.name)).toEqual(['a_read']);
        expect(consulted).toEqual(['ai']);
    });

    it('no app, a ferramenta de indicadores só sai com o plano da IA e nunca no WhatsApp', async () => {
        const tool: FakeTool = new FakeTool('market_benchmarks', 'ai', 'read');
        const app: AskRoute = { channel: 'app', feature: 'ai' };
        const allowedFor = (plan: boolean) =>
            new AskVeraToolRegistry(
                { getProviders: () => [{ instance: tool }] } as never,
                { allows: (feature: PaidFeature) => Promise.resolve(plan && feature === 'ai') } as never
            );
        const allowed: ReadonlySet<string> = new Set(['market_benchmarks']);

        expect((await allowedFor(true).available(allowed, app)).map((offered) => offered.name)).toEqual(['market_benchmarks']);
        expect(await allowedFor(false).available(allowed, app)).toEqual([]);
        expect(await allowedFor(true).available(new Set(['help_search']), app)).toEqual([]);
    });
});
