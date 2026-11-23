import { Injectable } from '@nestjs/common';
import { ReminderCancellationPort } from '../../whatsapp-link/services/reminder-cancellation.port';
import { CANCEL_REASONS } from '../domain/reminders.types';
import { ReminderEngineService } from './reminder-engine.service';

@Injectable()
export class ReminderCancellationAdapter extends ReminderCancellationPort {
    public constructor(private readonly engine: ReminderEngineService) {
        super();
    }

    public async cancelForLink(linkId: string): Promise<number> {
        return this.engine.cancel({ linkId }, CANCEL_REASONS.unlinked);
    }
}
