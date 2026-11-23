import { Injectable } from '@nestjs/common';
import { User } from '../domain/identity.types';
import { AdminSecurityMailerService } from './admin-security-mailer.service';
import { PlatformAuditRecorderService } from './platform-audit-recorder.service';
import { PlatformLoginAuditService } from './platform-login-audit.service';

@Injectable()
export class SecondFactorNotifierService {
    public constructor(
        private readonly audit: PlatformAuditRecorderService,
        private readonly login: PlatformLoginAuditService,
        private readonly mailer: AdminSecurityMailerService
    ) {}

    public async enrolled(user: User, ip: string | undefined): Promise<void> {
        await this.audit.totpEnrolled(user, ip);
        await this.mailer.totpActivated(user);
    }

    public async recoveryCodeUsed(user: User, ip: string | undefined): Promise<void> {
        await this.audit.recoveryCodeUsed(user, ip);
        await this.mailer.recoveryCodeUsed(user);
    }

    public async locked(user: User, ip: string | undefined): Promise<void> {
        await this.audit.totpLocked(user, ip);
    }

    public async signedIn(user: User, ip: string | undefined): Promise<void> {
        await this.login.granted(user, ip);
    }
}
