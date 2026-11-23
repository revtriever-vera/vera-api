import { Injectable } from '@nestjs/common';
import { CompanyProductLimitsRepository } from '../repositories/company-product-limits.repository';
import { CompanyProductLimit, LimitRow } from './plans.types';

@Injectable()
export class PlanLimitDomain {
    public constructor(private readonly limits: CompanyProductLimitsRepository) {}

    public static inForce(row: LimitRow, at: Date): boolean {
        return row.startsAt <= at && (row.endsAt === null || at < row.endsAt);
    }

    public static pick(company: readonly LimitRow[], catalog: readonly LimitRow[], at: Date): LimitRow | null {
        const own: LimitRow | undefined = company.find((row: LimitRow): boolean => PlanLimitDomain.inForce(row, at));
        if (own) {
            return own;
        }
        return catalog.find((row: LimitRow): boolean => PlanLimitDomain.inForce(row, at)) ?? null;
    }

    public async companyLimits(productId: string, unit: string): Promise<CompanyProductLimit[]> {
        return this.limits.listFor(productId, unit);
    }
}
