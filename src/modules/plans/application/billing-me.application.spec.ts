import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { SubscriptionSummaryPort } from '../services/subscription-summary.port';
import { BillingMeApplication } from './billing-me.application';

const SELF_DECLARED: string = 'self:paramtypes';
const OPTIONAL: string = 'optional:paramtypes';
const SUMMARY_INDEX: number = 6;

describe('BillingMeApplication', () => {
    it('injeta a porta opcional de resumo da assinatura por token explícito (tipo união chega como Object no swc)', () => {
        const injected: Array<{ index: number; param: unknown }> = Reflect.getMetadata(SELF_DECLARED, BillingMeApplication) ?? [];
        const optional: number[] = Reflect.getMetadata(OPTIONAL, BillingMeApplication) ?? [];

        expect(injected.find((entry) => entry.index === SUMMARY_INDEX)?.param).toBe(SubscriptionSummaryPort);
        expect(optional).toContain(SUMMARY_INDEX);
    });
});
