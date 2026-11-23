import { Injectable } from '@nestjs/common';
import { NoticeSendsRepository } from '../repositories/notice-sends.repository';

@Injectable()
export class NoticeSendDomain {
    public constructor(private readonly sends: NoticeSendsRepository) {}

    public async claim(userId: string, type: string, key: string): Promise<string | null> {
        return this.sends.claim(userId, type, key);
    }

    public async release(id: string): Promise<void> {
        await this.sends.release(id);
    }

    public async removeOfUser(userId: string): Promise<number> {
        return this.sends.removeOfUser(userId);
    }
}
