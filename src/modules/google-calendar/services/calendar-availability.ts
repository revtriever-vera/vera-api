import { Injectable } from '@nestjs/common';
import { PaidFeatureAvailabilityPort } from '../../plans/services/paid-feature-availability.port';
import { CalendarCredentialsService } from './calendar-credentials.service';

@Injectable()
export class CalendarAvailability extends PaidFeatureAvailabilityPort {
    public readonly feature: PaidFeatureAvailabilityPort['feature'] = 'calendar';

    public constructor(private readonly credentials: CalendarCredentialsService) {
        super();
    }

    public async enabled(): Promise<boolean> {
        return (await this.credentials.resolve()) !== null;
    }
}
