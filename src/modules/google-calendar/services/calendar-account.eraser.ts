import { Injectable } from '@nestjs/common';
import { AsCompany } from '../../../core/context/as-company.decorator';
import { AccountDataEraserPort } from '../../identity/services/account-data-eraser.port';
import { CalendarClientService } from './calendar-client.service';

export const CALENDAR_ERASE_AREA: string = 'calendar';

@Injectable()
export class CalendarAccountEraser extends AccountDataEraserPort {
    public readonly area: string = CALENDAR_ERASE_AREA;

    public constructor(private readonly client: CalendarClientService) {
        super();
    }

    @AsCompany()
    public async eraseAll(_companyId: string): Promise<number> {
        return this.client.disconnectAll();
    }
}
