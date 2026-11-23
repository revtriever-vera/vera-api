import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';
import { IdUtil } from '../../../shared/utils/id.util';
import { TEMPLATE_STATUSES, TemplateRegistration, TemplateStatus } from '../domain/whatsapp.types';

export type RegistrationInput = {
    readonly channelKey: string;
    readonly name: string;
    readonly language: string;
    readonly version: number;
    readonly status: TemplateStatus;
    readonly remoteId: string | null;
    readonly rejectedReason: string | null;
};

@Injectable()
export class WhatsAppTemplateRegistrationsRepository extends BareGlobalRepository<'WhatsAppTemplateRegistrations'> {
    public constructor(database: DatabaseClient) {
        super(database, 'WhatsAppTemplateRegistrations');
    }

    public async upsert(input: RegistrationInput): Promise<TemplateRegistration> {
        return this.upsertRow(
            { id: IdUtil.newId(), ...input },
            {
                columns: ['channelKey', 'name', 'language'],
                update: {
                    version: input.version,
                    status: input.status,
                    remoteId: input.remoteId,
                    rejectedReason: input.rejectedReason,
                    updatedAt: new Date()
                }
            }
        );
    }

    public async listByChannel(channelKey: string): Promise<TemplateRegistration[]> {
        return this.findMany({ channelKey });
    }

    public async findApproved(channelKey: string, name: string, language: string): Promise<TemplateRegistration | null> {
        return this.findOne({ channelKey, name, language, status: TEMPLATE_STATUSES.approved });
    }
}
