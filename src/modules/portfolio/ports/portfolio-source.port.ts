import { PortfolioSourceData } from '../domain/portfolio.types';

export abstract class PortfolioSourcePort {
    public abstract load(): Promise<PortfolioSourceData>;
}
