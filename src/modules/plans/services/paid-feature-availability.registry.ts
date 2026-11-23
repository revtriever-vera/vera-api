import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { PaidFeature } from '../domain/plans.types';
import { PaidFeatureAvailabilityPort } from './paid-feature-availability.port';

@Injectable()
export class PaidFeatureAvailabilityRegistry {
    public constructor(private readonly discovery: DiscoveryService) {}

    public async enabled(feature: PaidFeature): Promise<boolean> {
        const ports: PaidFeatureAvailabilityPort[] = this.ports().filter(
            (port: PaidFeatureAvailabilityPort): boolean => port.feature === feature
        );
        if (ports.length === 0) {
            return false;
        }
        const answers: boolean[] = await Promise.all(ports.map(async (port: PaidFeatureAvailabilityPort) => port.enabled()));
        return answers.every(Boolean);
    }

    private ports(): PaidFeatureAvailabilityPort[] {
        return this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper): unknown => wrapper.instance)
            .filter((instance: unknown): instance is PaidFeatureAvailabilityPort => instance instanceof PaidFeatureAvailabilityPort);
    }
}
