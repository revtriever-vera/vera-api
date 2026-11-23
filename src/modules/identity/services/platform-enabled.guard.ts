import { CanActivate, Injectable } from '@nestjs/common';
import { PlatformDisabledError } from '../domain/identity.errors';
import { PlatformAvailabilityService } from './platform-availability.service';

@Injectable()
export class PlatformEnabledGuard implements CanActivate {
    public constructor(private readonly availability: PlatformAvailabilityService) {}

    public canActivate(): boolean {
        if (!this.availability.enabled()) {
            throw new PlatformDisabledError();
        }
        return true;
    }
}
