import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';

@Injectable()
export class RevtrieverEventCursorsRepository extends BareGlobalRepository<'RevtrieverEventCursors'> {
    public constructor(database: DatabaseClient) {
        super(database, 'RevtrieverEventCursors');
    }

    public async cursorOf(source: string): Promise<string | null> {
        const row: { cursor: string | null } | null = await this.findOne({ source });
        return row?.cursor ?? null;
    }

    public async save(source: string, cursor: string): Promise<void> {
        await this.upsertRow({ source, cursor }, { columns: ['source'], update: { cursor, updatedAt: new Date() } });
    }
}
