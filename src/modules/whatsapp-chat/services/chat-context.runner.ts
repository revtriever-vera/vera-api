import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import type { ResolvedSender } from '../../whatsapp-link/services/link-resolver.service';

@Injectable()
export class ChatContextRunner {
    public constructor(private readonly context: AppContext) {}

    public async as<T>(sender: ResolvedSender, fn: () => Promise<T>): Promise<T> {
        return this.context.run({ ...this.context.get(), companyId: sender.companyId, userId: sender.userId, locale: sender.locale }, fn);
    }
}
