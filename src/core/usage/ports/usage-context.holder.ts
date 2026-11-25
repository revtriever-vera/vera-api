import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { DateUtil } from '../../../shared/utils/date.util';
import { usageConfig } from '../config/usage.config';
import { UsageContextPort } from './usage-context.port';

@Injectable()
export class UsageContextHolder {
    private port: UsageContextPort | null = null;

    public constructor(@Inject(usageConfig.KEY) private readonly config: ConfigType<typeof usageConfig>) {}

    public register(port: UsageContextPort): void {
        this.port = port;
    }

    public async capMicros(): Promise<number | null> {
        if (this.port !== null) {
            return this.port.capMicros();
        }
        return this.configuredCapMicros();
    }

    public async helpCapMicros(): Promise<number | null> {
        return this.port === null ? null : this.port.helpCapMicros();
    }

    public configuredHelpCapMicros(): number | null {
        return this.config.PAID_HELP_CAP_MICROS === 0 ? null : this.config.PAID_HELP_CAP_MICROS;
    }

    public configuredCapMicros(): number | null {
        return this.config.PAID_USAGE_CAP_MICROS === 0 ? null : this.config.PAID_USAGE_CAP_MICROS;
    }

    public async timezone(): Promise<string> {
        return this.port === null ? DateUtil.BRAZIL_TIMEZONE : this.port.timezone();
    }
}
