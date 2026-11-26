import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { portfolioEventsConfig } from '../config/portfolio-events.config';
import { EVENT_SOURCES, EventSource } from '../domain/portfolio-events.types';
import { PORTFOLIO_EVENT_SOURCES, PortfolioEventSourcePort } from '../ports/portfolio-event-source.port';

type PortfolioEventsSettings = ConfigType<typeof portfolioEventsConfig>;

export function selectEventSources(
    config: PortfolioEventsSettings,
    live: Readonly<Record<EventSource, PortfolioEventSourcePort>>
): PortfolioEventSourcePort[] {
    const enabled: PortfolioEventSourcePort[] = [];
    if (config.PORTFOLIO_EVENTS_FNET_ENABLED) {
        enabled.push(live[EVENT_SOURCES.fnet]);
    }
    if (config.PORTFOLIO_EVENTS_CVM_IPE_ENABLED) {
        enabled.push(live[EVENT_SOURCES.cvmIpe]);
    }
    return enabled;
}

@Injectable()
export class PortfolioEventSourceRegistryService {
    private readonly bySource: ReadonlyMap<EventSource, PortfolioEventSourcePort>;

    public constructor(@Inject(PORTFOLIO_EVENT_SOURCES) private readonly sources: readonly PortfolioEventSourcePort[]) {
        this.bySource = new Map<EventSource, PortfolioEventSourcePort>(
            sources.map((port: PortfolioEventSourcePort): [EventSource, PortfolioEventSourcePort] => [port.source, port])
        );
    }

    public enabled(): readonly PortfolioEventSourcePort[] {
        return this.sources;
    }

    public find(source: EventSource): PortfolioEventSourcePort | null {
        return this.bySource.get(source) ?? null;
    }
}
