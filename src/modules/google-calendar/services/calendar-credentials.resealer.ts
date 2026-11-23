import { Injectable } from '@nestjs/common';
import { ResealableSecretsPort, SealedRecord } from '../../../core/crypto/resealable-secrets.port';
import { SecretSealerPort } from '../../../core/crypto/secret-sealer.port';
import { CalendarConnectionDomain } from '../domain/calendar-connection.domain';
import { CALENDAR_PURPOSE, CalendarConnection } from '../domain/calendar.types';

@Injectable()
export class CalendarCredentialsResealer extends ResealableSecretsPort {
    public readonly purpose: string = CALENDAR_PURPOSE;

    public constructor(
        private readonly connections: CalendarConnectionDomain,
        private readonly sealer: SecretSealerPort
    ) {
        super();
    }

    public async listCompanyIds(): Promise<string[]> {
        return this.connections.companyIdsWithTokens();
    }

    public async listSealed(_companyId: string): Promise<SealedRecord[]> {
        const rows: CalendarConnection[] = await this.connections.listWithTokens();
        return rows.map((row: CalendarConnection): SealedRecord => ({ id: row.id, sealed: row.refreshTokenSealed as string }));
    }

    public async replaceSealed(_companyId: string, id: string, sealed: string): Promise<void> {
        await this.connections.replaceSealed(id, sealed, this.sealer.driver);
    }
}
