import { Injectable } from '@nestjs/common';
import { CryptoPort } from '../../../core/crypto/crypto.port';
import { UserTotp } from '../domain/identity.types';
import { RecoveryCodeBatch, RecoveryCodeService } from './recovery-code.service';
import { TotpService } from './totp.service';

export interface NewTotpSecret {
    readonly plain: string;
    readonly encrypted: string;
    readonly otpauthUri: string;
}

@Injectable()
export class SecondFactorCodesService {
    public constructor(
        private readonly totp: TotpService,
        private readonly recovery: RecoveryCodeService,
        private readonly crypto: CryptoPort
    ) {}

    public newSecret(email: string): NewTotpSecret {
        const plain: string = this.totp.generateSecret();
        return { plain, encrypted: this.crypto.encrypt(plain), otpauthUri: this.totp.buildOtpAuthUri(email, plain) };
    }

    public looksLikeTotpCode(input: string): boolean {
        return this.totp.looksLikeCode(input);
    }

    public stepOf(stored: UserTotp, code: string): number | null {
        return this.totp.matchedStep(code, this.crypto.decrypt(stored.secretEncrypted));
    }

    public newRecoveryBatch(): RecoveryCodeBatch {
        return this.recovery.generateBatch();
    }

    public recoveryHash(code: string): string {
        return this.recovery.hash(code);
    }
}
