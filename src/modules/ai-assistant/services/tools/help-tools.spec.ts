import { describe, expect, it } from 'vitest';
import { AppContext } from '../../../../core/context/app-context.port';
import { CurrentUserService } from '../../../identity/services/current-user.service';
import { ASK_VERA_HELP_FEATURE } from '../../domain/ask-vera.types';
import { HelpSearchTool } from './help-search.tool';
import { WhereIsTool } from './where-is.tool';

function contextOf(locale: 'pt-BR' | 'en'): AppContext {
    return { get: () => ({ requestId: 'r', locale }) } as unknown as AppContext;
}

function usersOf(role: string): CurrentUserService {
    return { require: () => Promise.resolve({ role }) } as unknown as CurrentUserService;
}

describe('HelpSearchTool', () => {
    it('é de ajuda, sem plano pago, e só lê', () => {
        const tool: HelpSearchTool = new HelpSearchTool(contextOf('pt-BR'));
        expect(tool.name).toBe('help_search');
        expect(tool.feature).toBe(ASK_VERA_HELP_FEATURE);
        expect(tool.kind).toBe('read');
    });

    it('acha por sinônimo, no idioma da pessoa', async () => {
        const output = await new HelpSearchTool(contextOf('pt-BR')).run({ query: 'reduzir gastos' });
        expect(JSON.stringify(output.payload)).toContain('/spending/cuts');
    });

    it('diz que não há resultado', async () => {
        const output = await new HelpSearchTool(contextOf('en')).run({ query: 'cake recipe' });
        expect(output.payload).toEqual({ status: 'no_result', entradas: [] });
    });

    it('rejeita entrada vazia ou com campo a mais', () => {
        const tool: HelpSearchTool = new HelpSearchTool(contextOf('pt-BR'));
        expect(tool.inputSchema.safeParse({ query: '' }).success).toBe(false);
        expect(tool.inputSchema.safeParse({ query: 'x', extra: 1 }).success).toBe(false);
    });
});

describe('WhereIsTool', () => {
    it('é de ajuda, sem plano pago, e só lê', () => {
        const tool: WhereIsTool = new WhereIsTool(contextOf('pt-BR'), usersOf('viewer'));
        expect(tool.name).toBe('where_is');
        expect(tool.feature).toBe(ASK_VERA_HELP_FEATURE);
        expect(tool.kind).toBe('read');
    });

    it('devolve o link quando o papel abre a tela', async () => {
        const output = await new WhereIsTool(contextOf('pt-BR'), usersOf('owner')).run({ topic: 'convidar pessoas' });
        expect(output.payload).toMatchObject({ telas: [{ link: '/settings/people' }], semAcesso: [] });
    });

    it('põe em semAcesso, sem link, a tela que o papel não abre', async () => {
        const output = await new WhereIsTool(contextOf('pt-BR'), usersOf('viewer')).run({ topic: 'convidar pessoas' });
        expect(output.payload).toEqual({ telas: [], semAcesso: [{ tela: 'Pessoas', papel: 'Dono' }] });
    });

    it('diz que não há tela', async () => {
        const output = await new WhereIsTool(contextOf('en'), usersOf('owner')).run({ topic: 'cake recipe' });
        expect(output.payload).toMatchObject({ status: 'no_result' });
    });
});
