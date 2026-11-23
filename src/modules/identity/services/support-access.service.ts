import { Injectable } from '@nestjs/common';
import { AppContext } from '../../../core/context/app-context.port';
import { PLATFORM_AUDIT_ACTIONS, PlatformAuditEntry, User } from '../domain/identity.types';
import { PlatformAuditDomain } from '../domain/platform-audit.domain';
import { UserDomain } from '../domain/user.domain';
import { UnauthorizedError } from '../domain/identity.errors';

export const SUPPORT_ACCESS_LIMIT: number = 100;

export interface SupportAccessItem {
    readonly id: string;
    readonly at: Date;
    readonly operatorName: string | null;
    readonly reason: string;
    readonly layers: readonly string[];
}

@Injectable()
export class SupportAccessService {
    public constructor(
        private readonly audit: PlatformAuditDomain,
        private readonly users: UserDomain,
        private readonly context: AppContext
    ) {}

    public async listForCurrentAccount(): Promise<SupportAccessItem[]> {
        const companyId: string | undefined = this.context.get().companyId;
        if (companyId === undefined) {
            throw new UnauthorizedError();
        }
        const entries: PlatformAuditEntry[] = await this.audit.listOfTarget(
            companyId,
            PLATFORM_AUDIT_ACTIONS.accountViewed,
            SUPPORT_ACCESS_LIMIT
        );
        const names: Map<string, string> = await this.operatorNames(entries);
        return entries.map((entry: PlatformAuditEntry): SupportAccessItem => ({
            id: entry.id,
            at: entry.createdAt,
            operatorName: entry.operatorUserId === null ? null : (names.get(entry.operatorUserId) ?? null),
            reason: metaText(entry.meta, 'reason'),
            layers: metaList(entry.meta, 'layers')
        }));
    }

    private async operatorNames(entries: readonly PlatformAuditEntry[]): Promise<Map<string, string>> {
        const ids: string[] = [
            ...new Set(
                entries.flatMap((entry: PlatformAuditEntry): string[] => (entry.operatorUserId === null ? [] : [entry.operatorUserId]))
            )
        ];
        const operators: User[] = await this.users.findManyByIdsAcrossTenants(ids);
        return new Map(operators.map((operator: User): [string, string] => [operator.id, operator.name]));
    }
}

function metaOf(meta: unknown): Record<string, unknown> {
    return meta !== null && typeof meta === 'object' ? (meta as Record<string, unknown>) : {};
}

function metaText(meta: unknown, key: string): string {
    const value: unknown = metaOf(meta)[key];
    return typeof value === 'string' ? value : '';
}

function metaList(meta: unknown, key: string): string[] {
    const value: unknown = metaOf(meta)[key];
    return Array.isArray(value) ? value.filter((item: unknown): item is string => typeof item === 'string') : [];
}
