import { Injectable } from '@nestjs/common';
import { PlanCatalogDomain } from '../domain/plan-catalog.domain';
import { PlanDomain } from '../domain/plan.domain';
import { CompanyProduct, PlanKey, PRODUCT_KEYS } from '../domain/plans.types';

export interface PlatformPlanOverview {
    readonly premium: number;
    readonly trials: number;
}

export interface PlatformPlanOfCompany {
    readonly plan: PlanKey;
    readonly source: string | null;
    readonly since: Date | null;
    readonly trialEndsAt: Date | null;
}

const FREE: PlatformPlanOfCompany = { plan: 'free', source: null, since: null, trialEndsAt: null };

@Injectable()
export class PlatformPlanReaderService {
    public constructor(
        private readonly catalog: PlanCatalogDomain,
        private readonly plans: PlanDomain
    ) {}

    public async overview(): Promise<PlatformPlanOverview> {
        const productId: string = (await this.catalog.productOf(PRODUCT_KEYS.premium)).id;
        return {
            premium: await this.plans.countOpenLines(productId, false),
            trials: await this.plans.countOpenLines(productId, true)
        };
    }

    public async ofCompanies(companyIds: readonly string[]): Promise<Map<string, PlatformPlanOfCompany>> {
        const productId: string = (await this.catalog.productOf(PRODUCT_KEYS.premium)).id;
        const lines: CompanyProduct[] = await this.plans.openLinesOfCompanies(productId, companyIds);
        const byCompany: Map<string, PlatformPlanOfCompany> = new Map(
            lines.map((line: CompanyProduct): [string, PlatformPlanOfCompany] => [
                line.companyId,
                { plan: 'premium', source: line.source, since: line.startsAt, trialEndsAt: line.trialEndsAt }
            ])
        );
        return new Map(companyIds.map((id: string): [string, PlatformPlanOfCompany] => [id, byCompany.get(id) ?? FREE]));
    }
}
