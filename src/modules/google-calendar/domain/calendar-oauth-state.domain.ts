import { Injectable } from '@nestjs/common';
import { CalendarOAuthStatesRepository } from '../repositories/calendar-oauth-states.repository';
import { STATE_TTL_MS } from './calendar.types';

@Injectable()
export class CalendarOAuthStateDomain {
    public constructor(private readonly states: CalendarOAuthStatesRepository) {}

    public async open(nonce: string, userId: string, codeVerifier: string, now: Date): Promise<void> {
        await this.states.create({ nonce, userId, codeVerifier, expiresAt: new Date(now.getTime() + STATE_TTL_MS) });
    }

    public async consume(nonce: string, userId: string, now: Date): Promise<string | null> {
        return (await this.states.consume(nonce, userId, now))?.codeVerifier ?? null;
    }
}
