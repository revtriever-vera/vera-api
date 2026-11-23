import { Injectable } from '@nestjs/common';
import { CryptoPort } from '../../../core/crypto/crypto.port';
import { OAuthStatePayload, readStateText, stateTextOf } from '../domain/oauth-state';

@Injectable()
export class CalendarStateService {
    public constructor(private readonly crypto: CryptoPort) {}

    public issue(payload: Omit<OAuthStatePayload, 'expiresAt'>, now: Date): string {
        return this.crypto.encrypt(stateTextOf(payload, now));
    }

    public read(state: string, now: Date): OAuthStatePayload | null {
        try {
            return readStateText(this.crypto.decrypt(state), now);
        } catch {
            return null;
        }
    }
}
