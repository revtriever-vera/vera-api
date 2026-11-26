import { describe, expect, it, vi } from 'vitest';
import { ANY_HOLDER } from '../../../shared/holder/holder-filter';
import { PortfolioAgendaService } from '../services/portfolio-agenda.service';
import { PortfolioAgendaApplication } from './portfolio-agenda.application';

function build() {
    const buildAgenda = vi.fn().mockResolvedValue([]);
    return { application: new PortfolioAgendaApplication({ build: buildAgenda } as unknown as PortfolioAgendaService), buildAgenda };
}

describe('PortfolioAgendaApplication', () => {
    it('devolve a janela e os itens', async () => {
        const { application, buildAgenda } = build();

        const response = await application.list({ from: '2026-12-01', to: '2026-12-31' }, ANY_HOLDER);

        expect(response).toEqual({ from: '2026-12-01', to: '2026-12-31', items: [] });
        expect(buildAgenda).toHaveBeenCalledOnce();
    });

    it('aceita a janela de 366 dias', async () => {
        const { application } = build();

        await expect(application.list({ from: '2026-01-01', to: '2027-01-02' }, ANY_HOLDER)).resolves.toBeDefined();
    });

    it('recusa janela que termina antes de começar ou passa de 366 dias', async () => {
        const { application, buildAgenda } = build();

        await expect(application.list({ from: '2026-12-02', to: '2026-12-01' }, ANY_HOLDER)).rejects.toMatchObject({
            code: 'portfolio_watch.invalid_agenda_window'
        });
        await expect(application.list({ from: '2026-01-01', to: '2027-01-03' }, ANY_HOLDER)).rejects.toMatchObject({ status: 400 });
        expect(buildAgenda).not.toHaveBeenCalled();
    });
});
