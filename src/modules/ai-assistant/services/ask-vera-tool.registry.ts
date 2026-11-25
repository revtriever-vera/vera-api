import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { PlanGateService } from '../../plans/services/plan-gate.service';
import { AskRoute } from '../domain/ask-channel-profiles';
import { ASK_VERA_FEATURE, ASK_VERA_HELP_FEATURE } from '../domain/ask-vera.types';
import { AskVeraToolFeature, AskVeraToolPort } from './ask-vera-tool.port';

function gateFeatureOf(feature: AskVeraToolFeature, route: AskRoute): AskVeraToolFeature {
    return feature === ASK_VERA_FEATURE && route.channel === 'app' ? route.feature : feature;
}

@Injectable()
export class AskVeraToolRegistry {
    public constructor(
        private readonly discovery: DiscoveryService,
        private readonly gate: PlanGateService
    ) {}

    public async available(allowed: ReadonlySet<string>, route: AskRoute): Promise<readonly AskVeraToolPort[]> {
        const offered: AskVeraToolPort[] = [];
        for (const tool of this.all()) {
            if (allowed.has(tool.name) && (await this.offered(gateFeatureOf(tool.feature, route)))) {
                offered.push(tool);
            }
        }
        return offered;
    }

    private async offered(feature: AskVeraToolFeature): Promise<boolean> {
        return feature === ASK_VERA_HELP_FEATURE || (await this.gate.allows(feature));
    }

    public all(): readonly AskVeraToolPort[] {
        return this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper): unknown => wrapper.instance)
            .filter((instance: unknown): instance is AskVeraToolPort => instance instanceof AskVeraToolPort)
            .sort((left: AskVeraToolPort, right: AskVeraToolPort): number => left.name.localeCompare(right.name));
    }
}
