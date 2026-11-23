import { Injectable } from '@nestjs/common';
import { RevtrieverEventCursorsRepository } from '../repositories/revtriever-event-cursors.repository';

@Injectable()
export class RevtrieverEventCursorDomain {
    public constructor(private readonly cursors: RevtrieverEventCursorsRepository) {}

    public async cursorOf(source: string): Promise<string | null> {
        return this.cursors.cursorOf(source);
    }

    public async save(source: string, cursor: string): Promise<void> {
        await this.cursors.save(source, cursor);
    }
}
