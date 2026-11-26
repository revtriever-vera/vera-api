import { Injectable } from '@nestjs/common';
import { MemberDirectoryService } from '../../identity/services/member-directory.service';
import {
    ImportProposal,
    InvestmentImportAssistantService,
    UploadedReport
} from '../../investment-import/services/investment-import-assistant.service';
import { AttachmentRoleError } from '../domain/assistant-chat.errors';

@Injectable()
export class AssistantAttachmentService {
    public constructor(
        private readonly imports: InvestmentImportAssistantService,
        private readonly members: MemberDirectoryService
    ) {}

    public async propose(userId: string, file: UploadedReport, modelConsent: boolean): Promise<ImportProposal> {
        if (!(await this.members.canEdit(userId))) {
            throw new AttachmentRoleError();
        }
        return this.imports.propose(file, modelConsent);
    }
}
