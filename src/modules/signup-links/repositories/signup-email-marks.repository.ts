import { Injectable } from '@nestjs/common';
import { DatabaseClient } from '../../../core/database/database.client';
import { BareGlobalRepository } from '../../../core/database/repositories/bare-global.repository';

@Injectable()
export class SignupEmailMarksRepository extends BareGlobalRepository<'SignupEmailMarks'> {
    public constructor(database: DatabaseClient) {
        super(database, 'SignupEmailMarks');
    }

    public async claim(id: string, emailHash: string, signupLinkId: string): Promise<boolean> {
        const row: { id: string } | undefined = await this.insertBuilder()
            .values({ id, emailHash, signupLinkId })
            .onConflict((conflict) => conflict.column('emailHash').doNothing())
            .returning('id')
            .executeTakeFirst();
        return row !== undefined;
    }
}
