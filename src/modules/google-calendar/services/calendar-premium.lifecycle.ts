import { Injectable } from '@nestjs/common';
import { PremiumLifecyclePort } from '../../plans/services/premium-lifecycle.port';
import { CalendarClientService } from './calendar-client.service';

@Injectable()
export class CalendarPremiumLifecycle extends PremiumLifecyclePort {
    public readonly name: string = 'calendar';

    public constructor(private readonly client: CalendarClientService) {
        super();
    }

    public async onPremiumEnded(): Promise<void> {
        await this.client.disconnectAll();
    }
}
