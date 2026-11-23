import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';

const STEP_SECONDS: number = 30;
const MS_PER_SECOND: number = 1000;
const ACCEPTED_STEPS_BACK: number = 1;
const ISSUER: string = 'Vera admin';
const CODE_PATTERN: RegExp = /^\d{6}$/;

@Injectable()
export class TotpService {
    public generateSecret(): string {
        return authenticator.generateSecret();
    }

    public buildOtpAuthUri(email: string, secret: string): string {
        return authenticator.keyuri(email, ISSUER, secret);
    }

    public looksLikeCode(input: string): boolean {
        return CODE_PATTERN.test(input.trim());
    }

    public matchedStep(code: string, secret: string): number | null {
        const delta: number | null = authenticator.clone({ window: [ACCEPTED_STEPS_BACK, 0] }).checkDelta(code.trim(), secret);
        if (delta === null) {
            return null;
        }
        return Math.floor(Date.now() / (STEP_SECONDS * MS_PER_SECOND)) + delta;
    }
}
