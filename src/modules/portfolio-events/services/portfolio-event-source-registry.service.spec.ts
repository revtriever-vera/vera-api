import { describe, expect, it } from 'vitest';
import { parsePortfolioEventsConfig } from '../config/portfolio-events.config';
import { PortfolioEventSourcePort } from '../ports/portfolio-event-source.port';
import { selectEventSources } from './portfolio-event-source-registry.service';

const FNET = { source: 'fnet' } as PortfolioEventSourcePort;
const CVM_IPE = { source: 'cvm_ipe' } as PortfolioEventSourcePort;
const LIVE = { fnet: FNET, cvm_ipe: CVM_IPE } as const;

describe('selectEventSources', () => {
    it('starts with every source off', () => {
        expect(selectEventSources(parsePortfolioEventsConfig({}), LIVE)).toEqual([]);
    });

    it('turns each source on by its own flag', () => {
        expect(selectEventSources(parsePortfolioEventsConfig({ PORTFOLIO_EVENTS_CVM_IPE_ENABLED: 'true' }), LIVE)).toEqual([CVM_IPE]);
        expect(
            selectEventSources(
                parsePortfolioEventsConfig({ PORTFOLIO_EVENTS_FNET_ENABLED: 'true', PORTFOLIO_EVENTS_CVM_IPE_ENABLED: 'true' }),
                LIVE
            )
        ).toEqual([FNET, CVM_IPE]);
    });
});
