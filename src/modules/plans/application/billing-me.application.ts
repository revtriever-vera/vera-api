import { Injectable } from '@nestjs/common';
import { BillingMeService } from '../services/billing-me.service';
import { BillingMe } from '../validation/billing-me.schemas';

@Injectable()
export class BillingMeApplication {
    public constructor(private readonly service: BillingMeService) {}

    public async get(): Promise<BillingMe> {
        return this.service.get();
    }
}
