import { EventSource, IssuerLink, PortfolioEventDraft } from '../domain/portfolio-events.types';

export abstract class PortfolioEventSourcePort {
    public abstract readonly source: EventSource;

    public abstract handles(link: IssuerLink): boolean;

    public abstract fetchFor(link: IssuerLink): Promise<readonly PortfolioEventDraft[]>;
}

export const PORTFOLIO_EVENT_SOURCES: unique symbol = Symbol('PORTFOLIO_EVENT_SOURCES');
