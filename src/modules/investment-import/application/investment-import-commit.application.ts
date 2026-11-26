import { Injectable } from '@nestjs/common';
import { CommitView } from '../domain/investment-import.types';
import { CommitInput, InvestmentImportCommitService } from '../services/investment-import-commit.service';

@Injectable()
export class InvestmentImportCommitApplication {
    public constructor(private readonly service: InvestmentImportCommitService) {}

    public async commit(input: CommitInput): Promise<CommitView> {
        return this.service.commit(input);
    }
}
