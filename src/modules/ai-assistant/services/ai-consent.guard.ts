import { CanActivate, Injectable } from '@nestjs/common';
import { AiConsentService } from './ai-consent.service';

@Injectable()
export class AiConsentGuard implements CanActivate {
    public constructor(private readonly consent: AiConsentService) {}

    public async canActivate(): Promise<boolean> {
        await this.consent.assertGranted();
        return true;
    }
}
