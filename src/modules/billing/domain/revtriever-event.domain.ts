import { Injectable } from '@nestjs/common';
import { NewEvent, RevtrieverEventsRepository } from '../repositories/revtriever-events.repository';
import { EventRowStatus, RevtrieverEvent } from './billing.types';

@Injectable()
export class RevtrieverEventDomain {
    public constructor(private readonly events: RevtrieverEventsRepository) {}

    public async insertOnce(event: NewEvent): Promise<RevtrieverEvent | null> {
        return this.events.insertOnce(event);
    }

    public async findById(id: string): Promise<RevtrieverEvent | null> {
        return this.events.findById(id);
    }

    public async finish(id: string, status: EventRowStatus, error: string | null): Promise<void> {
        await this.events.finish(id, status, error);
    }

    public async listStalledReceived(before: Date, limit: number): Promise<RevtrieverEvent[]> {
        return this.events.listStalledReceived(before, limit);
    }

    public async listRecent(limit: number): Promise<RevtrieverEvent[]> {
        return this.events.listRecent(limit);
    }

    public async listReceivedBetween(from: Date, to: Date, limit: number): Promise<RevtrieverEvent[]> {
        return this.events.listReceivedBetween(from, to, limit);
    }

    public async listOfTypeSince(type: string, since: Date): Promise<RevtrieverEvent[]> {
        return this.events.listOfTypeSince(type, since);
    }

    public async listReceivedOfSubscription(engineSubscriptionId: string, limit: number): Promise<RevtrieverEvent[]> {
        return this.events.listReceivedOfSubscription(engineSubscriptionId, limit);
    }
}
