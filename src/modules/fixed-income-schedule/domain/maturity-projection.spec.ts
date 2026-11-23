import { describe, expect, it } from 'vitest';
import { makeRates, makeScheduleTitle, makeScheduleTreasury, TODAY } from '../../../../test/support/schedule-fixtures';
import { projectTitle, projectTreasury } from './maturity-projection';

describe('projectTitle', () => {
    it('prefixado a 10% ao ano por 252 dias úteis rende exatamente 10%', () => {
        const projection = projectTitle(makeScheduleTitle(), TODAY, makeRates());

        expect(projection).toEqual({ valueMinor: 11_000_000, estimated: false, basis: 'contract' });
    });

    it('prefixado não depende das séries de índice', () => {
        const projection = projectTitle(makeScheduleTitle(), TODAY, makeRates({ cdiAnnual: null, ipca12m: null }));

        expect(projection.valueMinor).toBe(11_000_000);
        expect(projection.estimated).toBe(false);
    });

    it('CDI percentual projeta com a taxa constante multiplicada pelo percentual', () => {
        const projection = projectTitle(makeScheduleTitle({ indexer: 'cdi_percent', rateBps: 11000 }), TODAY, makeRates());

        expect(projection).toEqual({ valueMinor: 11_100_000, estimated: false, basis: 'cdi_projection' });
    });

    it('IPCA mais taxa compõe a inflação de 12 meses com a taxa contratada', () => {
        const projection = projectTitle(makeScheduleTitle({ indexer: 'ipca_plus', rateBps: 600 }), TODAY, makeRates());

        expect(projection).toEqual({ valueMinor: 11_024_000, estimated: false, basis: 'ipca_projection' });
    });

    it('vencendo hoje o valor é o de hoje', () => {
        const projection = projectTitle(makeScheduleTitle({ maturityDate: TODAY }), TODAY, makeRates());

        expect(projection.valueMinor).toBe(10_000_000);
    });

    it('sem a série do índice devolve o valor de hoje estimado', () => {
        const cdi = projectTitle(makeScheduleTitle({ indexer: 'cdi_percent', rateBps: 11000 }), TODAY, makeRates({ cdiAnnual: null }));
        const ipca = projectTitle(makeScheduleTitle({ indexer: 'ipca_plus', rateBps: 600 }), TODAY, makeRates({ ipca12m: null }));

        expect(cdi).toEqual({ valueMinor: 10_000_000, estimated: true, basis: 'cdi_projection' });
        expect(ipca).toEqual({ valueMinor: 10_000_000, estimated: true, basis: 'ipca_projection' });
    });

    it('título que a valorização não conseguiu cobrir sai estimado e com o valor de hoje', () => {
        const projection = projectTitle(makeScheduleTitle({ indexDataMissing: true }), TODAY, makeRates());

        expect(projection).toEqual({ valueMinor: 10_000_000, estimated: true, basis: 'contract' });
    });

    it('herda a estimativa da valorização de hoje e marca o título em dólar como estimado', () => {
        expect(projectTitle(makeScheduleTitle({ valuationEstimated: true }), TODAY, makeRates()).estimated).toBe(true);
        expect(projectTitle(makeScheduleTitle({ currency: 'USD' }), TODAY, makeRates()).estimated).toBe(true);
    });

    it('arredonda meio centavo para cima', () => {
        const projection = projectTitle(makeScheduleTitle({ valueMinor: 5, rateBps: 1000 }), TODAY, makeRates());

        expect(projection.valueMinor).toBe(6);
    });
});

describe('projectTreasury', () => {
    it('Prefixado vale R$ 1.000 por unidade, exato', () => {
        const projection = projectTreasury(makeScheduleTreasury({ kind: 'prefixado', valueTodayMinor: null }), TODAY, makeRates());

        expect(projection).toEqual({ valueMinor: 250_000, estimated: false, basis: 'face_value' });
    });

    it('Selic projeta o valor de hoje pelo CDI anualizado', () => {
        const projection = projectTreasury(makeScheduleTreasury(), TODAY, makeRates());

        expect(projection).toEqual({ valueMinor: 1_100_000, estimated: false, basis: 'cdi_projection' });
    });

    it('Selic sem CDI mantém o valor de hoje, estimado', () => {
        const projection = projectTreasury(makeScheduleTreasury(), TODAY, makeRates({ cdiAnnual: null }));

        expect(projection).toEqual({ valueMinor: 1_000_000, estimated: true, basis: 'cdi_projection' });
    });

    it('IPCA+ projeta só pela inflação e diz que é só inflação', () => {
        const projection = projectTreasury(makeScheduleTreasury({ kind: 'ipca', valueTodayMinor: 500_000 }), TODAY, makeRates());

        expect(projection).toEqual({ valueMinor: 520_000, estimated: true, basis: 'inflation_only' });
    });

    it('IPCA+ sem série mantém o valor de hoje', () => {
        const projection = projectTreasury(
            makeScheduleTreasury({ kind: 'ipca', valueTodayMinor: 500_000 }),
            TODAY,
            makeRates({ ipca12m: null })
        );

        expect(projection).toEqual({ valueMinor: 500_000, estimated: true, basis: 'inflation_only' });
    });

    it('sem cotação não há valor de hoje para projetar', () => {
        expect(projectTreasury(makeScheduleTreasury({ valueTodayMinor: null }), TODAY, makeRates())).toBeNull();
        expect(projectTreasury(makeScheduleTreasury({ kind: 'ipca', valueTodayMinor: null }), TODAY, makeRates())).toBeNull();
    });
});
