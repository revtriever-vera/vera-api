import { Injectable } from '@nestjs/common';
import { InvalidPluggyCredentialsError, PluggyProviderUnavailableError } from '../domain/bank-connections.errors';
import { PluggyCredentialsPlain, PluggySession } from '../drivers/pluggy-session';
import { PluggyAuthRejectedError, PluggyUnavailableError } from '../ports/pluggy-client.errors';
import { PluggyClientPort } from '../ports/pluggy-client.port';
import { CredentialsVaultService } from './credentials-vault.service';
import { PluggyAvailabilityService } from './pluggy-availability.service';

const REJECTED_CODE: string = 'invalid_credentials';

@Injectable()
export class PluggyAuthenticatorService {
    public constructor(
        private readonly client: PluggyClientPort,
        private readonly vault: CredentialsVaultService,
        private readonly availability: PluggyAvailabilityService
    ) {}

    public async authenticate(credentials: PluggyCredentialsPlain): Promise<PluggySession> {
        this.availability.assertEnabled();
        try {
            return await this.client.authenticate(credentials);
        } catch (error: unknown) {
            if (error instanceof PluggyAuthRejectedError) {
                throw new InvalidPluggyCredentialsError();
            }
            if (error instanceof PluggyUnavailableError) {
                throw new PluggyProviderUnavailableError(error.retryAfterSeconds);
            }
            throw error;
        }
    }

    public async authenticateStored(retryInvalid: boolean): Promise<PluggySession> {
        this.availability.assertEnabled();
        const credentials: PluggyCredentialsPlain = retryInvalid ? await this.vault.openStored() : await this.vault.openForCurrentCompany();
        try {
            return await this.authenticate(credentials);
        } catch (error: unknown) {
            if (error instanceof InvalidPluggyCredentialsError) {
                await this.vault.markInvalid(REJECTED_CODE);
            }
            throw error;
        }
    }
}
