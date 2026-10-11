import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { SecretOpenFailedError } from '../../../core/crypto/secret-sealer.errors';
import { SealContext, SecretSealerPort } from '../../../core/crypto/secret-sealer.port';
import { MissingTenantContextError } from '../../../core/database/database.errors';
import { InvalidPluggyCredentialsError } from '../domain/bank-connections.errors';
import { CREDENTIAL_STATUSES, PLUGGY_CREDENTIALS_PURPOSE, PluggyCredential } from '../domain/bank-connections.types';
import { hintOf } from '../domain/client-id-hint';
import { PluggyCredentialsDomain, ReplacedCredentials, SealedCredentials } from '../domain/pluggy-credentials.domain';
import { PluggyCredentialsPlain } from '../drivers/pluggy-session';

const UNREADABLE_CODE: string = 'secret_unreadable';

@Injectable()
export class CredentialsVaultService {
    public constructor(
        private readonly credentials: PluggyCredentialsDomain,
        private readonly sealer: SecretSealerPort,
        private readonly context: AppContext
    ) {}

    public async current(): Promise<PluggyCredential | null> {
        return this.credentials.find();
    }

    public async seal(plain: PluggyCredentialsPlain): Promise<SealedCredentials> {
        return {
            sealed: await this.sealer.seal(plain.toSealableJson(), this.sealContext()),
            sealerDriver: this.sealer.driver,
            clientIdHint: hintOf(plain.clientIdValue)
        };
    }

    public async store(sealed: SealedCredentials): Promise<ReplacedCredentials> {
        return this.credentials.replace(sealed);
    }

    public async openForCurrentCompany(): Promise<PluggyCredentialsPlain> {
        const credential: PluggyCredential = await this.credentials.require();
        if (credential.status === CREDENTIAL_STATUSES.invalid) {
            throw new InvalidPluggyCredentialsError();
        }
        return PluggyCredentialsPlain.fromSealedJson(await this.openSealed(credential));
    }

    public async openStored(): Promise<PluggyCredentialsPlain> {
        return PluggyCredentialsPlain.fromSealedJson(await this.openSealed(await this.credentials.require()));
    }

    public async markValid(): Promise<PluggyCredential> {
        return this.credentials.markValid();
    }

    public async markInvalid(code: string): Promise<void> {
        await this.credentials.markInvalid(code);
    }

    public async remove(): Promise<number> {
        return this.credentials.eraseAll();
    }

    private async openSealed(credential: PluggyCredential): Promise<string> {
        try {
            return await this.sealer.open(credential.sealed, this.sealContext());
        } catch (error: unknown) {
            if (!(error instanceof SecretOpenFailedError)) {
                throw error;
            }
            await this.credentials.markInvalid(UNREADABLE_CODE);
            throw new InvalidPluggyCredentialsError();
        }
    }

    private sealContext(): SealContext {
        const companyId: string | undefined = this.context.getOrNull()?.companyId;
        if (companyId === undefined) {
            throw new MissingTenantContextError('PluggyCredentials');
        }
        return { companyId, purpose: PLUGGY_CREDENTIALS_PURPOSE };
    }
}
