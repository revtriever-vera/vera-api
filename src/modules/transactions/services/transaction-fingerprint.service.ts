import { Injectable } from '@nestjs/common';
import { HashUtil } from '../../../shared/utils/hash.util';

const FINGERPRINT_LENGTH: number = 32;

export interface FingerprintInput {
    readonly accountId: string;
    readonly date: string;
    readonly amountMinor: number;
    readonly normalizedDescription: string;
    readonly occurrence: number;
}

@Injectable()
export class TransactionFingerprintService {
    public of(input: FingerprintInput): string {
        const tuple: string = [
            input.accountId,
            input.date,
            String(input.amountMinor),
            input.normalizedDescription,
            String(input.occurrence)
        ].join('|');
        return HashUtil.sha256(tuple).slice(0, FINGERPRINT_LENGTH);
    }
}
