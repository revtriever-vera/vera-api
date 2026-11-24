import { Injectable } from '@nestjs/common';
import { PlatformAccessTokensRepository } from '../repositories/platform-access-tokens.repository';
import { PlatformAccessToken } from './identity.types';

export interface TokenIssueInput {
    readonly name: string;
    readonly tokenHash: string;
    readonly tokenHint: string;
    readonly createdByUserId: string;
    readonly expiresAt: Date;
}

@Injectable()
export class PlatformAccessTokenDomain {
    public constructor(private readonly tokens: PlatformAccessTokensRepository) {}

    public async issue(input: TokenIssueInput): Promise<PlatformAccessToken> {
        return this.tokens.issue(input);
    }

    public async findByHash(tokenHash: string): Promise<PlatformAccessToken | null> {
        return this.tokens.findByHash(tokenHash);
    }

    public async listNewestFirst(limit: number): Promise<PlatformAccessToken[]> {
        return this.tokens.listNewestFirst(limit);
    }

    public async revoke(id: string, at: Date): Promise<PlatformAccessToken | null> {
        return (await this.tokens.revoke(id, at)) ?? this.stillRevoked(id);
    }

    public async markUsed(id: string, at: Date): Promise<void> {
        await this.tokens.markUsed(id, at);
    }

    private async stillRevoked(id: string): Promise<PlatformAccessToken | null> {
        const existing: PlatformAccessToken | null = await this.tokens.findById(id);
        return existing?.revokedAt ? existing : null;
    }
}
