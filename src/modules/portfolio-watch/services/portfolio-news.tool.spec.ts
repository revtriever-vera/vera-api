import { describe, expect, it, vi } from 'vitest';
import { AppContext } from '../../../core/context/app-context.port';
import { PortfolioSnapshotService } from '../../portfolio/services/portfolio-snapshot.service';
import { ChangeItem } from '../domain/portfolio-changes.types';
import { PortfolioChangesReaderService } from './portfolio-changes-reader.service';
import { PortfolioNewsTool } from './portfolio-news.tool';

const CONTEXT = { get: () => ({ requestId: 'r', locale: 'pt-BR' }) } as unknown as AppContext;

function item(symbol: string, overrides: Partial<ChangeItem> = {}): ChangeItem {
    return {
        id: `id-${symbol}`,
        assetId: `asset-${symbol}`,
        symbol,
        source: 'b3_fnet',
        category: 'relevant_fact',
        title: 'Título com https://exemplo.com.br/x',
        kind: 'relevant_fact',
        date: '2026-03-18',
        summary: 'O fundo distribuiu R$ 0,78 por cota.',
        summaryAvailable: true,
        relevance: 3,
        weightBps: 800,
        weightLine: `${symbol} é 8% da sua carteira.`,
        documentUrl: 'https://fnet.bmfbovespa.com.br/x',
        ...overrides
    };
}

function toolOf(items: ChangeItem[], classes: unknown[] = []) {
    const read = vi.fn().mockResolvedValue(items);
    const build = vi.fn().mockResolvedValue({ classes });
    const tool = new PortfolioNewsTool(
        { items: read } as unknown as PortfolioChangesReaderService,
        { build } as unknown as PortfolioSnapshotService,
        CONTEXT
    );
    return { tool, read, build };
}

describe('portfolio_news', () => {
    it('é de leitura e do plano da IA', () => {
        const { tool } = toolOf([]);

        expect(tool).toMatchObject({ name: 'portfolio_news', kind: 'read', feature: 'ai' });
        expect(tool.description('pt-BR')).toContain('não diz o que fazer');
        expect(tool.description('en')).toContain('does not say what to do');
    });

    it('valida a entrada: janela de até 30 dias, campos desconhecidos recusados', async () => {
        const { tool } = toolOf([]);

        await expect(tool.run({ days: 31 })).rejects.toThrow();
        await expect(tool.run({ days: 0 })).rejects.toThrow();
        await expect(tool.run({ other: 1 })).rejects.toThrow();
    });

    it('devolve até 5 itens com ativo, tipo, data, resumo e peso, sem título nem link', async () => {
        const items = ['A', 'B', 'C', 'D', 'E', 'F'].map((letter: string) => item(`${letter}FII11`));
        const { tool, read } = toolOf(items);

        const output = await tool.run({});

        expect(read).toHaveBeenCalledWith(expect.objectContaining({ days: 7, classId: null }));
        const itens = (output.payload as { itens: unknown[] }).itens;
        expect(itens).toHaveLength(5);
        expect(itens[0]).toEqual({
            ativo: 'AFII11',
            tipo: 'fato relevante',
            data: '18/03/2026',
            resumo: 'O fundo distribuiu R$ 0,78 por cota.',
            peso: '8%'
        });
        expect(JSON.stringify(output.payload)).not.toMatch(/https?:|Título/u);
        expect(output.numbers).toBeUndefined();
    });

    it('filtra por ativo sem diferenciar maiúscula e usa a janela pedida', async () => {
        const { tool, read } = toolOf([item('XPLG11'), item('HGLG11')]);

        const output = await tool.run({ assetKey: 'hglg11', days: 30 });

        expect(read).toHaveBeenCalledWith(expect.objectContaining({ days: 30 }));
        expect((output.payload as { itens: { ativo: string }[] }).itens.map((entry) => entry.ativo)).toEqual(['HGLG11']);
    });

    it('sem documento devolve o estado, e resumo indisponível vira nulo', async () => {
        expect((await toolOf([]).tool.run({})).payload).toEqual({ status: 'no_news', janela_dias: 7 });
        const output = await toolOf([item('XPLG11', { summaryAvailable: false, kind: null, weightBps: null })]).tool.run({});

        expect((output.payload as { itens: unknown[] }).itens[0]).toMatchObject({ tipo: 'documento', resumo: null, peso: null });
    });

    it('resolve a classe pela chave do portfolio_overview, a personalizada pela ordem, e recusa chave que não existe', async () => {
        const classes = [
            { classId: 'c-fii', systemKey: 'fiis' },
            { classId: 'c-x', systemKey: null },
            { classId: 'c-y', systemKey: null }
        ];
        const first = toolOf([item('XPLG11')], classes);
        await first.tool.run({ classId: 'fiis' });
        expect(first.read).toHaveBeenCalledWith(expect.objectContaining({ classId: 'c-fii' }));

        const second = toolOf([item('XPLG11')], classes);
        await second.tool.run({ classId: 'custom_2' });
        expect(second.read).toHaveBeenCalledWith(expect.objectContaining({ classId: 'c-y' }));

        const missing = toolOf([item('XPLG11')], classes);
        expect((await missing.tool.run({ classId: 'nao_existe' })).payload).toEqual({ status: 'class_not_found' });
        expect(missing.read).not.toHaveBeenCalled();
    });
});
