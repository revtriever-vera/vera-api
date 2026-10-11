import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { SampleFailedError } from '../domain/onboarding.errors';
import { OnboardingSampleLogService } from './onboarding-sample-log.service';
import { SampleAreaResult, SampleDataPort } from './sample-data.port';

@Injectable()
export class SampleDataRegistry {
    public constructor(
        private readonly discovery: DiscoveryService,
        private readonly log: OnboardingSampleLogService
    ) {}

    public available(): boolean {
        return this.ports().length > 0;
    }

    public async seedAll(companyId: string): Promise<SampleAreaResult[]> {
        return this.runAll((port: SampleDataPort): Promise<number> => port.seed(companyId));
    }

    public async clearAll(companyId: string): Promise<SampleAreaResult[]> {
        return this.runAll((port: SampleDataPort): Promise<number> => port.clear(companyId));
    }

    private async runAll(run: (port: SampleDataPort) => Promise<number>): Promise<SampleAreaResult[]> {
        const results: SampleAreaResult[] = [];
        for (const port of this.ports()) {
            results.push({ area: port.area, count: await this.runOne(port, run) });
        }
        return results;
    }

    private async runOne(port: SampleDataPort, run: (port: SampleDataPort) => Promise<number>): Promise<number> {
        try {
            return await run(port);
        } catch (error: unknown) {
            this.log.areaFailed(port.area, error);
            throw new SampleFailedError(port.area);
        }
    }

    private ports(): SampleDataPort[] {
        return this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper): unknown => wrapper.instance)
            .filter((instance: unknown): instance is SampleDataPort => instance instanceof SampleDataPort)
            .sort((left: SampleDataPort, right: SampleDataPort): number => left.area.localeCompare(right.area));
    }
}
