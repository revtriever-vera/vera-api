import { Injectable } from '@nestjs/common';
import { UserTotpsRepository } from '../repositories/user-totps.repository';
import { UserTotp } from './identity.types';
import { RecoveryCodeDomain } from './recovery-code.domain';
import { UserTotpValidation } from './validations/user-totp.validation';

@Injectable()
export class UserTotpDomain {
    public constructor(
        private readonly totps: UserTotpsRepository,
        private readonly recoveryCodes: RecoveryCodeDomain
    ) {}

    public async findByUserId(userId: string): Promise<UserTotp | null> {
        return this.totps.findByUserId(userId);
    }

    public async beginEnrollment(userId: string, secretEncrypted: string): Promise<UserTotp> {
        UserTotpValidation.assertEnrollable(await this.totps.findByUserId(userId));
        return this.totps.savePending(userId, secretEncrypted);
    }

    public async requirePending(userId: string): Promise<UserTotp> {
        const totp: UserTotp | null = await this.totps.findByUserId(userId);
        UserTotpValidation.assertPending(totp);
        return totp;
    }

    public async requireActive(userId: string): Promise<UserTotp> {
        const totp: UserTotp | null = await this.totps.findByUserId(userId);
        UserTotpValidation.assertActive(totp);
        return totp;
    }

    public async activate(totp: UserTotp, step: number, recoveryCodeHashes: readonly string[]): Promise<void> {
        await this.totps.activate(totp.id, step, new Date());
        await this.recoveryCodes.replace(totp.userId, recoveryCodeHashes);
    }

    public async claimStep(totp: UserTotp, step: number): Promise<boolean> {
        return this.totps.claimStep(totp.id, step);
    }

    public async consumeRecoveryCode(userId: string, codeHash: string): Promise<boolean> {
        return this.recoveryCodes.consume(userId, codeHash);
    }

    public async reset(userId: string): Promise<void> {
        await this.totps.removeForUser(userId);
        await this.recoveryCodes.removeAll(userId);
    }
}
