import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { bankConnectionsConfig } from '../config/bank-connections.config';
import { ProviderDisabledError } from '../domain/bank-connections.errors';

@Injectable()
export class PluggyAvailabilityService {
    public constructor(@Inject(bankConnectionsConfig.KEY) private readonly config: ConfigType<typeof bankConnectionsConfig>) {}

    public get driver(): 'live' | 'mock' {
        return this.config.PLUGGY_DRIVER;
    }

    public assertEnabled(): void {
        if (!this.config.PLUGGY_ENABLED) {
            throw new ProviderDisabledError();
        }
    }
}
