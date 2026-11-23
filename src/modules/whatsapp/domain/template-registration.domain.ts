import { Injectable } from '@nestjs/common';
import { RegistrationInput, WhatsAppTemplateRegistrationsRepository } from '../repositories/whatsapp-template-registrations.repository';
import { TemplateRegistration } from './whatsapp.types';

@Injectable()
export class TemplateRegistrationDomain {
    public constructor(private readonly registrations: WhatsAppTemplateRegistrationsRepository) {}

    public async save(input: RegistrationInput): Promise<TemplateRegistration> {
        return this.registrations.upsert(input);
    }

    public async list(channelKey: string): Promise<TemplateRegistration[]> {
        return this.registrations.listByChannel(channelKey);
    }

    public async isApproved(channelKey: string, name: string, language: string): Promise<boolean> {
        return (await this.registrations.findApproved(channelKey, name, language)) !== null;
    }
}
