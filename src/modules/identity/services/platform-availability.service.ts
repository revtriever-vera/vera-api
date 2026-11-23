import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { authConfig } from '../config/auth.config';

@Injectable()
export class PlatformAvailabilityService {
    public constructor(@Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>) {}

    public enabled(): boolean {
        return this.config.DEPLOYMENT_MODE !== 'self_hosted';
    }
}
