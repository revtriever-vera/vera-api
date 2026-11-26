import { Injectable } from '@nestjs/common';
import { HolderFilter } from '../../../shared/holder/holder-filter';
import { DecimalUtil } from '../../../shared/utils/decimal.util';
import { Asset, AssetCatalogService } from '../../catalog/services/asset-catalog.service';
import { MaturitiesReading, MaturitiesReaderService, MaturityItem } from '../../fixed-income-schedule/services/maturities-reader.service';
import { PortfolioEventsReaderService, PortfolioEventView } from '../../portfolio-events/services/portfolio-events-reader.service';
import { Position, PositionReaderService } from '../../positions/services/position-reader.service';
import { byAgendaOrder, eventAgendaItem, insideWindow, maturityAgendaItem, quantityByAsset } from '../domain/agenda-items';
import { AgendaItem, AgendaWindow } from '../domain/portfolio-agenda.types';

@Injectable()
export class PortfolioAgendaService {
    public constructor(
        private readonly positions: PositionReaderService,
        private readonly catalog: AssetCatalogService,
        private readonly events: PortfolioEventsReaderService,
        private readonly maturities: MaturitiesReaderService
    ) {}

    public async build(window: AgendaWindow, holder: HolderFilter): Promise<AgendaItem[]> {
        const held: Position[] = (await this.positions.listForCompany(holder)).filter(
            (position: Position): boolean => !position.isSample && DecimalUtil.of(position.quantity).gt(0)
        );
        const fromEvents: AgendaItem[] = await this.eventItems(held, window);
        const reading: MaturitiesReading = await this.maturities.readAll(holder);
        const fromMaturities: AgendaItem[] = reading.items
            .filter((item: MaturityItem): boolean => !item.isSample && insideWindow(item.maturityDate, window))
            .map(maturityAgendaItem);
        return [...fromEvents, ...fromMaturities].sort(byAgendaOrder);
    }

    private async eventItems(held: readonly Position[], window: AgendaWindow): Promise<AgendaItem[]> {
        const quantities: Map<string, string> = quantityByAsset(held);
        const assetIds: string[] = [...quantities.keys()];
        if (assetIds.length === 0) {
            return [];
        }
        const assets: Asset[] = await this.catalog.findManyByIds(assetIds);
        const symbols: Map<string, string> = new Map(assets.map((asset: Asset): [string, string] => [asset.id, asset.symbol]));
        const events: PortfolioEventView[] = await this.events.forAssets(assetIds, window);
        return events.map((event: PortfolioEventView): AgendaItem =>
            eventAgendaItem(event, symbols.get(event.assetId) ?? event.assetId, quantities.get(event.assetId) ?? '0', window)
        );
    }
}
