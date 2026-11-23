import { Injectable } from '@nestjs/common';
import { PremiumLifecyclePort } from '../../plans/services/premium-lifecycle.port';
import { CANCEL_REASONS } from '../domain/reminders.types';
import { ReminderEngineService } from './reminder-engine.service';

@Injectable()
export class RemindersPremiumLifecycle extends PremiumLifecyclePort {
    public readonly name: string = 'reminders';

    public constructor(private readonly engine: ReminderEngineService) {
        super();
    }

    public async onPremiumEnded(): Promise<void> {
        await this.engine.cancel({ all: true }, CANCEL_REASONS.premiumEnded);
    }
}
