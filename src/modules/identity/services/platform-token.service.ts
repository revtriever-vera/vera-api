import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { ThrottleService } from '../../../core/throttle/throttle.service';
import { DateUtil } from '../../../shared/utils/date.util';
import { PlatformOnlyError, PlatformTokenNotFoundError, UnauthorizedError } from '../domain/identity.errors';
import { Company, PLATFORM_TOKEN_PREFIX, PlatformAccessToken, User } from '../domain/identity.types';
import { CompanyDomain } from '../domain/company.domain';
import { PlatformAccessTokenDomain } from '../domain/platform-access-token.domain';
import { UserDomain } from '../domain/user.domain';

const SECRET_BYTES: number = 32;
const HINT_LENGTH: number = 4;
const LIST_LIMIT: number = 200;
const USED_REFRESH_MS: number = 60_000;
const RATE_LIMIT: number = 120;
const RATE_WINDOW_SECONDS: number = 60;

export type PlatformTokenItem = PlatformAccessToken;

export interface IssuedPlatformToken {
    readonly secret: string;
    readonly token: PlatformTokenItem;
}

export interface PlatformTokenCaller {
    readonly tokenId: string;
    readonly userId: string;
    readonly companyId: string;
}

function hashOf(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
}

function isUsable(token: PlatformAccessToken | null, now: Date): token is PlatformAccessToken {
    return token !== null && token.revokedAt === null && token.expiresAt > now;
}

@Injectable()
export class PlatformTokenService {
    public constructor(
        private readonly tokens: PlatformAccessTokenDomain,
        private readonly users: UserDomain,
        private readonly companies: CompanyDomain,
        private readonly throttle: ThrottleService
    ) {}

    public operatorOf(userId: string | undefined): string {
        if (userId === undefined) {
            throw new UnauthorizedError();
        }
        return userId;
    }

    public async issue(createdByUserId: string, name: string, validDays: number): Promise<IssuedPlatformToken> {
        const secret: string = `${PLATFORM_TOKEN_PREFIX}${randomBytes(SECRET_BYTES).toString('base64url')}`;
        const token: PlatformAccessToken = await this.tokens.issue({
            name,
            tokenHash: hashOf(secret),
            tokenHint: secret.slice(-HINT_LENGTH),
            createdByUserId,
            expiresAt: DateUtil.addDays(new Date(), validDays)
        });
        return { secret, token };
    }

    public async list(): Promise<PlatformAccessToken[]> {
        return this.tokens.listNewestFirst(LIST_LIMIT);
    }

    public async revoke(id: string): Promise<PlatformAccessToken> {
        const token: PlatformAccessToken | null = await this.tokens.revoke(id, new Date());
        if (token === null) {
            throw new PlatformTokenNotFoundError();
        }
        return token;
    }

    public async authenticate(secret: string): Promise<PlatformTokenCaller> {
        const now: Date = new Date();
        const token: PlatformAccessToken | null = secret.startsWith(PLATFORM_TOKEN_PREFIX)
            ? await this.tokens.findByHash(hashOf(secret))
            : null;
        if (!isUsable(token, now)) {
            throw new UnauthorizedError();
        }
        const caller: PlatformTokenCaller = await this.callerOf(token);
        await this.throttle.assertAllowed(`platform-token:${token.id}`, RATE_LIMIT, RATE_WINDOW_SECONDS);
        await this.touch(token, now);
        return caller;
    }

    private async callerOf(token: PlatformAccessToken): Promise<PlatformTokenCaller> {
        const user: User | null = await this.users.findByIdAcrossTenants(token.createdByUserId);
        if (user?.removedAt !== null) {
            throw new UnauthorizedError();
        }
        const company: Company | null = await this.companies.findById(user.companyId);
        if (company?.isPlatform !== true) {
            throw new PlatformOnlyError();
        }
        return { tokenId: token.id, userId: user.id, companyId: company.id };
    }

    private async touch(token: PlatformAccessToken, now: Date): Promise<void> {
        if (token.lastUsedAt === null || now.getTime() - token.lastUsedAt.getTime() > USED_REFRESH_MS) {
            await this.tokens.markUsed(token.id, now);
        }
    }
}
