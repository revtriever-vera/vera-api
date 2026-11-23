import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { PlanGateService } from '../../plans/services/plan-gate.service';
import { AskVeraToolPort } from './ask-vera-tool.port';

@Injectable()
export class AskVeraToolRegistry {
    public constructor(
        private readonly discovery: DiscoveryService,
        private readonly gate: PlanGateService
    ) {}

    public async available(): Promise<readonly AskVeraToolPort[]> {
        const offered: AskVeraToolPort[] = [];
        for (const tool of this.all()) {
            if (await this.gate.allows(tool.feature)) {
                offered.push(tool);
            }
        }
        return offered;
    }

    public all(): readonly AskVeraToolPort[] {
        return this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper): unknown => wrapper.instance)
            .filter((instance: unknown): instance is AskVeraToolPort => instance instanceof AskVeraToolPort)
            .sort((left: AskVeraToolPort, right: AskVeraToolPort): number => left.name.localeCompare(right.name));
    }
}
