import { describe, expect, it } from 'vitest';
import { HELP_CATALOG, HELP_ROUTES } from './help-catalog';
import { HelpRole } from './help.types';
import { helpSearchPayload, whereIsPayload } from './help-answers';

const ROLE_RANK: Readonly<Record<HelpRole, number>> = { viewer: 1, editor: 2, owner: 3 };

function canOpenAs(role: HelpRole): (min: HelpRole | undefined) => boolean {
    return (min: HelpRole | undefined): boolean => ROLE_RANK[role] >= ROLE_RANK[min ?? 'viewer'];
}

describe('helpSearchPayload', () => {
    it('devolve texto, passos e link da tela', () => {
        const payload = helpSearchPayload(HELP_CATALOG, 'onde aportar', 'pt-BR');
        const first = (payload.entradas as Record<string, unknown>[])[0];
        expect(first).toMatchObject({ titulo: 'Onde aportar', link: '/portfolio/contribution', plano: 'todos' });
        expect(first?.steps).toHaveLength(3);
        expect(typeof first?.body).toBe('string');
    });

    it('responde no idioma pedido', () => {
        const payload = helpSearchPayload(HELP_CATALOG, 'delete account', 'en');
        expect((payload.entradas as Record<string, unknown>[])[0]).toMatchObject({ titulo: 'Delete the account' });
    });

    it('não devolve link para entrada sem tela', () => {
        const payload = helpSearchPayload(HELP_CATALOG, 'auto-hospedagem', 'pt-BR');
        const first = (payload.entradas as Record<string, unknown>[])[0];
        expect(first?.titulo).toBe('Auto-hospedagem');
        expect(first).not.toHaveProperty('link');
    });

    it('marca o que é do Premium', () => {
        const payload = helpSearchPayload(HELP_CATALOG, 'google agenda', 'pt-BR');
        expect((payload.entradas as Record<string, unknown>[])[0]).toMatchObject({ plano: 'premium' });
    });

    it('avisa quando não há resultado', () => {
        expect(helpSearchPayload(HELP_CATALOG, 'receita de bolo', 'pt-BR')).toEqual({ status: 'no_result', entradas: [] });
    });

    it('só devolve links que estão em HELP_ROUTES', () => {
        const links: unknown[] = ['carteira', 'gastos', 'conta', 'plano', 'importar'].flatMap((query: string): unknown[] =>
            (helpSearchPayload(HELP_CATALOG, query, 'pt-BR').entradas as Record<string, unknown>[]).map((entry) => entry.link)
        );
        expect(links.filter((link: unknown): boolean => typeof link === 'string' && !HELP_ROUTES.has(link))).toEqual([]);
    });
});

describe('whereIsPayload', () => {
    it('devolve a tela com link e o papel que a abre', () => {
        const payload = whereIsPayload(HELP_CATALOG, 'onde aportar', 'pt-BR', canOpenAs('editor'));
        expect(payload.telas).toEqual([{ tela: 'Onde aportar', papel: 'Leitura', link: '/portfolio/contribution' }]);
        expect(payload.semAcesso).toEqual([]);
    });

    it('põe em semAcesso, sem link, a tela que o papel não abre', () => {
        const payload = whereIsPayload(HELP_CATALOG, 'convidar pessoas', 'pt-BR', canOpenAs('viewer'));
        expect(payload.telas).toEqual([]);
        expect(payload.semAcesso).toEqual([{ tela: 'Pessoas', papel: 'Dono' }]);
    });

    it('libera a mesma tela para o Dono', () => {
        const payload = whereIsPayload(HELP_CATALOG, 'convidar pessoas', 'pt-BR', canOpenAs('owner'));
        expect(payload.telas).toEqual([{ tela: 'Pessoas', papel: 'Dono', link: '/settings/people' }]);
    });

    it('não repete a mesma tela', () => {
        const payload = whereIsPayload(HELP_CATALOG, 'exportar excluir conta dados privacidade', 'pt-BR', canOpenAs('owner'));
        const links: unknown[] = (payload.telas as Record<string, unknown>[]).map((tela) => tela.link);
        expect(new Set(links).size).toBe(links.length);
    });

    it('avisa quando não há tela', () => {
        expect(whereIsPayload(HELP_CATALOG, 'receita de bolo', 'pt-BR', canOpenAs('owner'))).toEqual({
            status: 'no_result',
            telas: [],
            semAcesso: []
        });
    });
});
