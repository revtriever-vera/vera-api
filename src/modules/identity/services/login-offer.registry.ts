import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { LoginOfferInput, LoginOfferOutcome, LoginOfferPort } from './login-offer.port';

@Injectable()
export class LoginOfferRegistry {
    public constructor(private readonly discovery: DiscoveryService) {}

    public async redeem(input: LoginOfferInput): Promise<LoginOfferOutcome | null> {
        const port: LoginOfferPort | undefined = this.discovery
            .getProviders()
            .map((wrapper: InstanceWrapper): unknown => wrapper.instance)
            .find((instance: unknown): instance is LoginOfferPort => instance instanceof LoginOfferPort);
        return port === undefined ? null : port.redeem(input);
    }
}
