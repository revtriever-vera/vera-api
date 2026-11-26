import { describe, expect, it } from 'vitest';
import { NoticeTypeRegistry } from '../../notices/services/notice-type.registry';
import { PortfolioWatchNoticeRegistrar } from './portfolio-watch-notice.registrar';

describe('PortfolioWatchNoticeRegistrar', () => {
    it('registra os quatro tipos de aviso com o mesmo template de lista e o do e-mail semanal', () => {
        const registry: NoticeTypeRegistry = new NoticeTypeRegistry();

        new PortfolioWatchNoticeRegistrar(registry).onModuleInit();

        expect(registry.types()).toEqual([
            'fixed_income_maturity_soon',
            'portfolio_assembly_soon',
            'portfolio_ex_date_tomorrow',
            'portfolio_payment_today',
            'portfolio_weekly_changes'
        ]);
        expect(registry.require('portfolio_payment_today').template).toBe('portfolio-watch-digest');
        expect(registry.require('portfolio_weekly_changes').template).toBe('portfolio-weekly-changes');
    });
});
