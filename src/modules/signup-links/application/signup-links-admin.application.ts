import { Injectable } from '@nestjs/common';
import { SignupLinksAdminService } from '../services/signup-links-admin.service';
import { CreateSignupLinkDto, SignupLinkListView, SignupLinkView, UpdateSignupLinkDto } from '../validation/signup-links.schemas';

@Injectable()
export class SignupLinksAdminApplication {
    public constructor(private readonly links: SignupLinksAdminService) {}

    public async create(input: CreateSignupLinkDto): Promise<SignupLinkView> {
        return this.links.create(input);
    }

    public async update(id: string, input: UpdateSignupLinkDto): Promise<SignupLinkView> {
        return this.links.update(id, input);
    }

    public async list(): Promise<SignupLinkListView> {
        return this.links.list();
    }

    public async revoke(id: string): Promise<void> {
        await this.links.revoke(id);
    }
}
