import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { OnboardingArea, OnboardingAreaSummary, OnboardingAreaSummaryPort } from './onboarding-area-summary.port';
import { OnboardingLogService } from './onboarding-log.service';

export type OnboardingAreaSummaries = Readonly<Record<OnboardingArea, OnboardingAreaSummary | null>>;

@Injectable()
export class OnboardingAreaRegistry {
    public constructor(
        private readonly discovery: DiscoveryService,
        private readonly log: OnboardingLogService
    ) {}

    public async summarize(companyId: string): Promise<OnboardingAreaSummaries> {
        const summaries: Record<OnboardingArea, OnboardingAreaSummary | null> = { assets: null, banks: null, target: null };
        await Promise.all(
            this.ports().map(async (port: OnboardingAreaSummaryPort): Promise<void> => {
                summaries[port.area] = await this.summarizeOne(port, companyId);
            })
        );
        return summaries;
    }

    private async summarizeOne(port: OnboardingAreaSummaryPort, companyId: string): Promise<OnboardingAreaSummary | null> {
        try {
            return await port.summarize(companyId);
        } catch (error: unknown) {
            this.log.summaryAreaFailed(port.area, error);
            return null;
        }
    }

    private ports(): OnboardingAreaSummaryPort[] {
        return this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper): unknown => wrapper.instance)
            .filter((instance: unknown): instance is OnboardingAreaSummaryPort => instance instanceof OnboardingAreaSummaryPort);
    }
}
