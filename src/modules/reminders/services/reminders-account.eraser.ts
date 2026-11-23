import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { AccountDataEraserPort } from '../../identity/services/account-data-eraser.port';
import { CANCEL_REASONS } from '../domain/reminders.types';
import { ReminderEngineService } from './reminder-engine.service';

export const REMINDERS_ERASE_AREA: string = 'reminders';

@Injectable()
export class RemindersAccountEraser extends AccountDataEraserPort {
    public readonly area: string = REMINDERS_ERASE_AREA;

    public constructor(private readonly engine: ReminderEngineService) {
        super();
    }

    @AsCompany()
    public async eraseAll(_companyId: string): Promise<number> {
        return this.engine.cancel({ all: true }, CANCEL_REASONS.accountDeleted);
    }
}
