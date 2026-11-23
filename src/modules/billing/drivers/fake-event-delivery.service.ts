import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { billingConfig } from '../config/billing.config';
import { EngineEvent } from '../domain/billing-engine.types';
import { BillingLogService } from '../services/billing-log.service';

const SIGNATURE_HEADER: string = 'x-revtriever-signature';
const MS_PER_SECOND: number = 1000;
const DELIVERY_TIMEOUT_MS: number = 3000;

export function signatureOf(secret: string, timestamp: number, body: string): string {
    const digest: string = createHmac('sha256', secret)
        .update(`${String(timestamp)}.${body}`)
        .digest('hex');
    return `t=${String(timestamp)},v1=${digest}`;
}

function post(url: string, secret: string, body: string): Promise<Response> {
    const timestamp: number = Math.floor(Date.now() / MS_PER_SECOND);
    return fetch(url, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            [SIGNATURE_HEADER]: signatureOf(secret, timestamp, body)
        },
        body,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS)
    });
}

@Injectable()
export class FakeEventDelivery {
    public constructor(
        @Inject(billingConfig.KEY) private readonly config: ConfigType<typeof billingConfig>,
        private readonly logs: BillingLogService
    ) {}

    public async deliver(event: EngineEvent): Promise<void> {
        const url: string | null = this.config.FAKE_BILLING_WEBHOOK_URL;
        const secret: string | null = this.config.FAKE_BILLING_WEBHOOK_SECRET;
        if (url === null || secret === null) {
            return;
        }
        try {
            const response: Response = await post(url, secret, JSON.stringify(event));
            await response.body?.cancel();
            if (!response.ok) {
                this.logs.fakeDeliveryFailed(event.type, `status_${String(response.status)}`);
            }
        } catch {
            this.logs.fakeDeliveryFailed(event.type, 'unreachable');
        }
    }
}
