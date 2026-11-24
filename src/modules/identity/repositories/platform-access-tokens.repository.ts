import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { NewPlatformAccessToken, PlatformAccessToken } from '../domain/identity.types';

type IssueData = Pick<NewPlatformAccessToken, 'name' | 'tokenHash' | 'tokenHint' | 'createdByUserId' | 'expiresAt'>;

@Injectable()
export class PlatformAccessTokensRepository extends BareGlobalRepository<'PlatformAccessTokens'> {
    public constructor(database: DatabaseClient) {
        super(database, 'PlatformAccessTokens');
    }

    public async issue(data: IssueData): Promise<PlatformAccessToken> {
        return this.createRow({ id: IdUtil.newId(), ...data });
    }

    public async findByHash(tokenHash: string): Promise<PlatformAccessToken | null> {
        return this.findOne({ tokenHash });
    }

    public async listNewestFirst(limit: number): Promise<PlatformAccessToken[]> {
        return this.findMany({}, { orderBy: [{ property: 'createdAt', direction: 'desc' }], limit });
    }

    public async revoke(id: string, at: Date): Promise<PlatformAccessToken | null> {
        const revoked: PlatformAccessToken[] = await this.updateManyRows({ id, revokedAt: null }, { revokedAt: at });
        return revoked[0] ?? null;
    }

    public async markUsed(id: string, at: Date): Promise<void> {
        await this.updateRow(id, { lastUsedAt: at });
    }
}
