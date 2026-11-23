import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { InboundMessage, WhatsAppChannel } from '../domain/whatsapp.types';
import { InboundDispatchPort } from './inbound-dispatch.port';

@Injectable()
export class InboundDispatchRegistry {
    public constructor(private readonly discovery: DiscoveryService) {}

    public async dispatch(message: InboundMessage, channel: WhatsAppChannel): Promise<number> {
        const ports: InboundDispatchPort[] = this.ports();
        for (const port of ports) {
            await port.handle(message, channel);
        }
        return ports.length;
    }

    private ports(): InboundDispatchPort[] {
        return this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper): unknown => wrapper.instance)
            .filter((instance: unknown): instance is InboundDispatchPort => instance instanceof InboundDispatchPort);
    }
}
