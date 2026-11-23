import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { OnboardingAreaSummary, OnboardingAreaSummaryPort } from '../../onboarding/services/onboarding-area-summary.port';
import { AccountDeletionLogDomain } from '../domain/account-deletion-log.domain';
import { CompanyDomain } from '../domain/company.domain';
import { ErasedArea, User } from '../domain/identity.types';
import { UserDomain } from '../domain/user.domain';
import { AccountDataRegistry } from './account-data.registry';

const CHECKED_AREAS: ReadonlySet<string> = new Set<string>(['assets', 'banks']);

@Injectable()
export class AccountEmptinessService {
    public constructor(
        private readonly discovery: DiscoveryService,
        private readonly userDomain: UserDomain,
        private readonly companies: CompanyDomain,
        private readonly deletionLog: AccountDeletionLogDomain,
        private readonly registry: AccountDataRegistry
    ) {}

    @AsCompany()
    public async eraseIfEmpty(companyId: string): Promise<boolean> {
        if (!(await this.isEmpty(companyId))) {
            return false;
        }
        const requestedAt: Date = new Date();
        const areas: ErasedArea[] = await this.registry.eraseAll(companyId);
        await this.deletionLog.record({ companyId, requestedAt, completedAt: new Date(), areas });
        await this.companies.eraseCompany(companyId);
        return true;
    }

    @AsCompany()
    public async isEmpty(companyId: string): Promise<boolean> {
        const members: User[] = await this.userDomain.listMembers();
        if (members.length > 1) {
            return false;
        }
        const results: boolean[] = await Promise.all(this.ports().map(async (port) => this.areaIsEmpty(port, companyId)));
        return results.every(Boolean);
    }

    private async areaIsEmpty(port: OnboardingAreaSummaryPort, companyId: string): Promise<boolean> {
        try {
            const summary: OnboardingAreaSummary = await port.summarize(companyId);
            return summary.items === 0;
        } catch {
            return false;
        }
    }

    private ports(): OnboardingAreaSummaryPort[] {
        return this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper): unknown => wrapper.instance)
            .filter(
                (instance: unknown): instance is OnboardingAreaSummaryPort =>
                    instance instanceof OnboardingAreaSummaryPort && CHECKED_AREAS.has(instance.area)
            );
    }
}
