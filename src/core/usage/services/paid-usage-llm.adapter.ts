import { Injectable } from '@nestjs/common';
import { LlmRecordInput, LlmRoomInput, LlmUsagePort } from '../../llm/ports/llm-usage.port';
import { UsdRateHolder } from '../ports/usd-rate.holder';
import { UsageDetail } from '../usage.types';
import { PaidUsageMeter } from './paid-usage-meter.service';

const MODEL_PATTERN: RegExp = /^[A-Za-z0-9._:/-]{1,80}$/;

function detailOf(detail: LlmRecordInput['detail']): UsageDetail | undefined {
    if (detail === undefined) {
        return undefined;
    }
    const model: unknown = detail['model'];
    const inputTokens: unknown = detail['inputTokens'];
    const outputTokens: unknown = detail['outputTokens'];
    return {
        ...(typeof model === 'string' && MODEL_PATTERN.test(model) ? { model } : {}),
        ...(typeof inputTokens === 'number' ? { inputTokens } : {}),
        ...(typeof outputTokens === 'number' ? { outputTokens } : {})
    };
}

@Injectable()
export class PaidUsageLlmAdapter extends LlmUsagePort {
    public constructor(
        private readonly meter: PaidUsageMeter,
        private readonly rates: UsdRateHolder
    ) {
        super();
    }

    public async assertRoom(input: LlmRoomInput): Promise<void> {
        await this.meter.assertRoom(input);
    }

    public async record(input: LlmRecordInput): Promise<void> {
        const detail: UsageDetail | undefined = detailOf(input.detail);
        await this.meter.record({
            feature: input.feature,
            task: input.task,
            referenceId: input.referenceId,
            costMicros: input.costMicros,
            outcome: input.outcome ?? 'answered',
            usdBrlRate: (await this.rates.current()).rate,
            ...(input.providerCostMicros === undefined ? {} : { providerCostMicros: input.providerCostMicros }),
            ...(input.estimateMicros === undefined ? {} : { estimateMicros: input.estimateMicros }),
            ...(detail === undefined ? {} : { detail })
        });
    }
}
