import { DB } from '../generated/database.types';
import { GlobalRepository } from './global.repository';

type SoftDeletableColumns = { deletedAt: unknown };

export type BareGlobalTable = { [K in keyof DB]: DB[K] extends SoftDeletableColumns ? never : K }[keyof DB];

export abstract class BareGlobalRepository<TB extends BareGlobalTable> extends GlobalRepository<TB> {
    protected override scopeFilter(): Record<string, unknown> {
        return {};
    }
}
