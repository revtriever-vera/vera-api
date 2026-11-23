import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { OutboundFailure, OutboundFailurePort } from './outbound-failure.port';
import { WhatsAppLogService } from './whatsapp-log.service';

@Injectable()
export class OutboundFailureRegistry {
    public constructor(
        private readonly discovery: DiscoveryService,
        private readonly logs: WhatsAppLogService
    ) {}

    public async notify(failure: OutboundFailure): Promise<void> {
        for (const port of this.ports()) {
            await this.tell(port, failure);
        }
    }

    private async tell(port: OutboundFailurePort, failure: OutboundFailure): Promise<void> {
        try {
            await port.onOutboundFailed(failure);
        } catch (error: unknown) {
            this.logs.failureObserverFailed(error);
        }
    }

    private ports(): OutboundFailurePort[] {
        return this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper): unknown => wrapper.instance)
            .filter((instance: unknown): instance is OutboundFailurePort => instance instanceof OutboundFailurePort);
    }
}
