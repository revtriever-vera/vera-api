import { HolderFilter } from '../../../shared/holder/holder-filter';
import { PortfolioSourceData } from '../domain/portfolio.types';

export abstract class PortfolioSourcePort {
    public abstract load(filter: HolderFilter): Promise<PortfolioSourceData>;
}
