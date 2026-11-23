import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { SealContext, SecretSealerPort } from '../../../core/crypto/secret-sealer.port';
import { MissingTenantContextError } from '../../../core/database/database.errors';
import { IntegrationUnreadableError } from '../domain/integration-credentials.errors';
import { hintOf } from '../domain/hint';
import {
    INTEGRATION_CREDENTIALS_PURPOSE,
    IntegrationCredential,
    IntegrationCredentialsByKind,
    IntegrationKind,
    SealedIntegration
} from '../domain/integration.types';
import { sealedPayloadSchemas } from '../validation/integrations.schemas';

type SecretOf = { [K in IntegrationKind]: (credentials: IntegrationCredentialsByKind[K]) => string };
type PublicOf = { [K in IntegrationKind]: (credentials: IntegrationCredentialsByKind[K]) => Partial<SealedIntegration> };

type ParserOf = { [K in IntegrationKind]: (json: unknown) => IntegrationCredentialsByKind[K] };

const PARSER_OF: ParserOf = {
    llm: (json: unknown) => sealedPayloadSchemas.llm.parse(json),
    whatsapp: (json: unknown) => sealedPayloadSchemas.whatsapp.parse(json),
    google: (json: unknown) => sealedPayloadSchemas.google.parse(json)
};

const SECRET_OF: SecretOf = {
    llm: (credentials) => credentials.apiKey,
    whatsapp: (credentials) => credentials.accessToken,
    google: (credentials) => credentials.clientSecret
};

const PUBLIC_OF: PublicOf = {
    llm: (credentials) => ({ baseUrl: credentials.baseUrl, model: credentials.model }),
    whatsapp: (credentials) => ({ phoneNumberId: credentials.phoneNumberId }),
    google: (credentials) => ({ clientId: credentials.clientId })
};

@Injectable()
export class IntegrationVaultService {
    public constructor(
        private readonly sealer: SecretSealerPort,
        private readonly context: AppContext
    ) {}

    public async seal<K extends IntegrationKind>(kind: K, credentials: IntegrationCredentialsByKind[K]): Promise<SealedIntegration> {
        return {
            baseUrl: null,
            model: null,
            phoneNumberId: null,
            clientId: null,
            ...PUBLIC_OF[kind](credentials),
            kind,
            sealed: await this.sealer.seal(JSON.stringify(credentials), this.sealContext()),
            sealerDriver: this.sealer.driver,
            hint: hintOf(SECRET_OF[kind](credentials))
        };
    }

    public async open<K extends IntegrationKind>(kind: K, row: IntegrationCredential): Promise<IntegrationCredentialsByKind[K]> {
        try {
            const plain: string = await this.sealer.open(row.sealed, this.sealContext());
            return PARSER_OF[kind](JSON.parse(plain));
        } catch (error: unknown) {
            if (error instanceof MissingTenantContextError) {
                throw error;
            }
            throw new IntegrationUnreadableError();
        }
    }

    private sealContext(): SealContext {
        const companyId: string | undefined = this.context.getOrNull()?.companyId;
        if (companyId === undefined) {
            throw new MissingTenantContextError('IntegrationCredentials');
        }
        return { companyId, purpose: INTEGRATION_CREDENTIALS_PURPOSE };
    }
}
