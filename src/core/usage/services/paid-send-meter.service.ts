import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { SendPriceEntry, usageConfig } from '../config/usage.config';
import { UsdRateHolder } from '../ports/usd-rate.holder';
import { SendPriceUnavailableError } from '../usage.errors';
import { brlToMicros, scaleMicros, usdToMicros } from '../usage-conversion';
import { SendCategory, SendRecordInput, UsdRate } from '../usage.types';
import { PaidUsageMeter } from './paid-usage-meter.service';

interface PricedSend {
    readonly providerMicros: number;
    readonly usdBrlRate: string | null;
}

@Injectable()
export class PaidSendMeter {
    public constructor(
        @Inject(usageConfig.KEY) private readonly config: ConfigType<typeof usageConfig>,
        private readonly rates: UsdRateHolder,
        private readonly meter: PaidUsageMeter
    ) {}

    public async estimate(category: SendCategory): Promise<number> {
        const priced: PricedSend = await this.price(category);
        return scaleMicros(priced.providerMicros, this.config.PAID_SEND_COST_MULTIPLIER);
    }

    public async record(input: SendRecordInput): Promise<void> {
        const priced: PricedSend = await this.price(input.category);
        await this.meter.record({
            feature: 'whatsapp',
            task: input.task,
            referenceId: input.referenceId,
            costMicros: scaleMicros(priced.providerMicros, this.config.PAID_SEND_COST_MULTIPLIER),
            providerCostMicros: priced.providerMicros,
            usdBrlRate: priced.usdBrlRate ?? undefined,
            outcome: 'answered',
            detail: { category: input.category }
        });
    }

    private async price(category: SendCategory): Promise<PricedSend> {
        const entry: SendPriceEntry | undefined = this.config.WHATSAPP_PRICE_TABLE[category];
        if (entry === undefined) {
            throw new SendPriceUnavailableError(category);
        }
        if (entry.currency === 'BRL') {
            return { providerMicros: brlToMicros(entry.amount), usdBrlRate: null };
        }
        const rate: UsdRate = await this.rates.current();
        return { providerMicros: usdToMicros(entry.amount, rate.rate), usdBrlRate: rate.rate };
    }
}
