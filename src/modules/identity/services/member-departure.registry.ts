import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { MemberDeparturePort } from './member-departure.port';
import { MembersLogService } from './members-log.service';

@Injectable()
export class MemberDepartureRegistry {
    public constructor(
        private readonly discovery: DiscoveryService,
        private readonly logs: MembersLogService
    ) {}

    public async notifyRemoved(userId: string): Promise<void> {
        for (const port of this.ports()) {
            await this.notifyOne(port, userId);
        }
    }

    private async notifyOne(port: MemberDeparturePort, userId: string): Promise<void> {
        try {
            await port.onMemberRemoved(userId);
        } catch (error: unknown) {
            this.logs.departureFailed(port.area, userId, error);
        }
    }

    private ports(): MemberDeparturePort[] {
        return this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper): unknown => wrapper.instance)
            .filter((instance: unknown): instance is MemberDeparturePort => instance instanceof MemberDeparturePort);
    }
}
