import { Injectable, OnModuleInit } from '@nestjs/common';
import { UsageContextHolder } from '../../../core/usage/ports/usage-context.holder';
import { UsageContextPort } from '../../../core/usage/ports/usage-context.port';
import { CompanyTimezoneService } from '../../identity/services/company-timezone.service';
import { PlanLimitService } from './plan-limit.service';
import { PlanResolverService } from './plan-resolver.service';

@Injectable()
export class PlanUsageContextAdapter extends UsageContextPort implements OnModuleInit {
    public constructor(
        private readonly limits: PlanLimitService,
        private readonly resolver: PlanResolverService,
        private readonly timezones: CompanyTimezoneService,
        private readonly holder: UsageContextHolder
    ) {
        super();
    }

    public onModuleInit(): void {
        this.holder.register(this);
    }

    public async capMicros(): Promise<number | null> {
        return this.limits.capMicros(this.holder.configuredCapMicros());
    }

    public async helpCapMicros(): Promise<number | null> {
        return (await this.resolver.planOf()) === 'free' ? this.holder.configuredHelpCapMicros() : null;
    }

    public async timezone(): Promise<string> {
        return this.timezones.timezoneOfCompany();
    }
}
