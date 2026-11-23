import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { SecretOpenFailedError } from '../../../core/crypto/secret-sealer.errors';
import { SealContext, SecretSealerPort } from '../../../core/crypto/secret-sealer.port';
import { MissingTenantContextError } from '../../../core/database/database.errors';
import { CALENDAR_PURPOSE } from '../domain/calendar.types';

export interface SealedToken {
    readonly sealed: string;
    readonly sealerDriver: string;
}

@Injectable()
export class CalendarVaultService {
    public constructor(
        private readonly sealer: SecretSealerPort,
        private readonly context: AppContext
    ) {}

    public async seal(refreshToken: string): Promise<SealedToken> {
        return { sealed: await this.sealer.seal(refreshToken, this.sealContext()), sealerDriver: this.sealer.driver };
    }

    public async open(sealed: string): Promise<string | null> {
        try {
            return await this.sealer.open(sealed, this.sealContext());
        } catch (error: unknown) {
            if (error instanceof SecretOpenFailedError) {
                return null;
            }
            throw error;
        }
    }

    private sealContext(): SealContext {
        const companyId: string | undefined = this.context.getOrNull()?.companyId;
        if (companyId === undefined) {
            throw new MissingTenantContextError('CalendarConnections');
        }
        return { companyId, purpose: CALENDAR_PURPOSE };
    }
}
