import { Injectable } from '@nestjs/common';
import { UserRecoveryCodesRepository } from '../repositories/user-recovery-codes.repository';

@Injectable()
export class RecoveryCodeDomain {
    public constructor(private readonly codes: UserRecoveryCodesRepository) {}

    public async replace(userId: string, codeHashes: readonly string[]): Promise<void> {
        await this.codes.replaceForUser(userId, codeHashes);
    }

    public async consume(userId: string, codeHash: string): Promise<boolean> {
        return this.codes.consume(userId, codeHash);
    }

    public async removeAll(userId: string): Promise<void> {
        await this.codes.removeForUser(userId);
    }
}
