import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { HmacPort } from '../../../core/crypto/hmac.port';

export const RECOVERY_CODE_COUNT: number = 10;

const ALPHABET: string = 'abcdefghjkmnpqrstuvwxyz23456789';
const HALF_LENGTH: number = 5;
const SEPARATOR: string = '-';
const NOISE: RegExp = /[\s-]/g;

export interface RecoveryCodeBatch {
    readonly codes: readonly string[];
    readonly hashes: readonly string[];
}

@Injectable()
export class RecoveryCodeService {
    public constructor(private readonly hmac: HmacPort) {}

    public generateBatch(): RecoveryCodeBatch {
        const codes: string[] = Array.from({ length: RECOVERY_CODE_COUNT }, (): string => this.generateOne());
        return { codes, hashes: codes.map((code: string): string => this.hash(code)) };
    }

    public hash(code: string): string {
        return this.hmac.sha256Hex(`recovery-code:${code.toLowerCase().replace(NOISE, '')}`);
    }

    private generateOne(): string {
        const half = (): string => Array.from({ length: HALF_LENGTH }, (): string => ALPHABET[randomInt(ALPHABET.length)] ?? '').join('');
        return `${half()}${SEPARATOR}${half()}`;
    }
}
