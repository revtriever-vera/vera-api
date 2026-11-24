import { Injectable } from '@nestjs/common';
import { CompanyCapabilitiesRepository } from '../repositories/company-capabilities.repository';
import { CompanyProductsRepository } from '../repositories/company-products.repository';
import {
    CompanyCapability,
    CompanyProduct,
    ContractEndReason,
    ContractSource,
    DeploymentMode,
    EffectivePlan,
    OpenLinesOfSource,
    OpenSubscriptionLine,
    PAID_FEATURES,
    PaidFeature
} from './plans.types';

@Injectable()
export class PlanDomain {
    public constructor(
        private readonly contracts: CompanyProductsRepository,
        private readonly capabilities: CompanyCapabilitiesRepository
    ) {}

    public static effectivePlanOf(premiumLine: CompanyProduct | null, mode: DeploymentMode): EffectivePlan {
        if (mode === 'self_hosted') {
            return 'self_hosted';
        }
        return premiumLine === null ? 'free' : 'premium';
    }

    public static capabilitiesFor(
        plan: EffectivePlan,
        planCapabilities: readonly PaidFeature[],
        manual: readonly CompanyCapability[]
    ): PaidFeature[] {
        const base: Set<PaidFeature> = new Set(plan === 'self_hosted' ? PAID_FEATURES : planCapabilities);
        const manualByFeature: Map<string, boolean> = new Map(manual.map((row: CompanyCapability) => [row.capability, row.granted]));
        return PAID_FEATURES.filter((feature: PaidFeature): boolean => manualByFeature.get(feature) ?? base.has(feature));
    }

    public async openLineOf(productId: string): Promise<CompanyProduct | null> {
        return this.contracts.findOpen(productId);
    }

    public async openLinesOfCompanies(productId: string, companyIds: readonly string[]): Promise<CompanyProduct[]> {
        return this.contracts.listOpenOfCompaniesAcrossTenants(productId, companyIds);
    }

    public async openLinesBySource(productId: string): Promise<OpenLinesOfSource[]> {
        return this.contracts.openBySourceAcrossTenants(productId);
    }

    public async openSubscriptionLines(productId: string): Promise<OpenSubscriptionLine[]> {
        return this.contracts.openSubscriptionLinesAcrossTenants(productId);
    }

    public async hasAnyLineOf(productId: string): Promise<boolean> {
        return this.contracts.hasAny(productId);
    }

    public async open(
        productId: string,
        priceCents: number,
        startsAt: Date,
        source: ContractSource,
        subscriptionId: string | null,
        trialEndsAt: Date | null
    ): Promise<boolean> {
        return this.contracts.openLine({ productId, priceCents, startsAt, source, subscriptionId, trialEndsAt });
    }

    public async attachSubscription(productId: string, subscriptionId: string): Promise<boolean> {
        return this.contracts.attachSubscription(productId, subscriptionId);
    }

    public async detachSubscription(productId: string): Promise<boolean> {
        return this.contracts.detachSubscription(productId);
    }

    public async convertTrial(productId: string, subscriptionId: string, priceCents: number): Promise<boolean> {
        return this.contracts.convertTrial(productId, subscriptionId, priceCents);
    }

    public async convertCardTrial(productId: string, priceCents: number): Promise<boolean> {
        return this.contracts.convertCardTrial(productId, priceCents);
    }

    public async markTrialNoticeSent(productId: string, at: Date): Promise<boolean> {
        return this.contracts.markNoticeSent(productId, at);
    }

    public async trialsToProcess(now: Date, noticeUntil: Date, limit: number): Promise<CompanyProduct[]> {
        return this.contracts.listTrialsToProcessAcrossTenants(now, noticeUntil, limit);
    }

    public async close(productId: string, endsAt: Date, reason: ContractEndReason): Promise<boolean> {
        return this.contracts.closeLine(productId, endsAt, reason);
    }

    public async manualCapabilities(): Promise<CompanyCapability[]> {
        return this.capabilities.listManual();
    }
}
