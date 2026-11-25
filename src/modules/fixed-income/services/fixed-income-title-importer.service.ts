import { Injectable } from '@nestjs/common';
import { DateUtil } from '../../../shared/utils/date.util';
import { ClassAssignmentService } from '../../allocation/services/class-assignment.service';
import { ClassResolverService } from '../../allocation/services/class-resolver.service';
import { MemberDirectoryService } from '../../identity/services/member-directory.service';
import { IssuerDirectoryService } from '../../issuers/services/issuer-directory.service';
import type { Issuer, ResolvedIssuer } from '../../issuers/services/issuer-directory.service';
import { CURRENCIES, Indexer } from '../domain/curve/curve.types';
import { FixedIncomeTitleDomain, TitleDraft } from '../domain/fixed-income-title.domain';
import { IssuerKindMismatchError, TitleLimitReachedError, UnknownIssuerError } from '../domain/fixed-income.errors';
import {
    FixedIncomeTitle,
    MAX_TITLES_PER_COMPANY,
    SUGGESTED_CLASS_KEY_BY_INDEXER,
    TITLE_ACTIONS,
    TitleKind
} from '../domain/fixed-income.types';
import { assertValidTerms } from '../domain/terms-validation';
import { FixedIncomeLogService } from './fixed-income-log.service';

export type { TitleKind };

const SUBJECT_TYPE: Parameters<ClassAssignmentService['assign']>[0] = 'fixed_income';
const ISSUER_CANDIDATES: number = 5;
const DIACRITICS: RegExp = /\p{Diacritic}/gu;

export interface ImportedTitleDraft {
    readonly name: string;
    readonly kind: TitleKind;
    readonly issuerId: string | null;
    readonly indexer: Indexer;
    readonly rateBps: number;
    readonly appliedMinor: number;
    readonly appliedAt: string;
    readonly maturityDate: string;
}

export interface TitleProbe {
    readonly issuerId: string | null;
    readonly name: string;
    readonly indexer: Indexer;
    readonly maturityDate: string;
    readonly appliedMinor: number;
}

function normalized(text: string): string {
    return text.normalize('NFD').replace(DIACRITICS, '').toLowerCase().trim();
}

function sameTitle(probe: TitleProbe, title: FixedIncomeTitle): boolean {
    const sameIssuer: boolean =
        probe.issuerId !== null && title.issuerId !== null
            ? probe.issuerId === title.issuerId
            : normalized(probe.name) === normalized(title.name);
    return (
        sameIssuer &&
        probe.indexer === title.indexer &&
        probe.maturityDate === title.maturityDate &&
        probe.appliedMinor === title.appliedMinor
    );
}

@Injectable()
export class FixedIncomeTitleImporterService {
    public constructor(
        private readonly titles: FixedIncomeTitleDomain,
        private readonly classResolver: ClassResolverService,
        private readonly assignments: ClassAssignmentService,
        private readonly logs: FixedIncomeLogService,
        private readonly issuers: IssuerDirectoryService,
        private readonly members: MemberDirectoryService
    ) {}

    public matchIssuer(name: string | null, kind: TitleKind): string | null {
        if (name === null || normalized(name) === '') {
            return null;
        }
        const wanted: string = normalized(name);
        const found: ResolvedIssuer | undefined = this.issuers
            .search(name, null, ISSUER_CANDIDATES)
            .find(
                (issuer: ResolvedIssuer): boolean =>
                    normalized(issuer.name) === wanted && this.issuers.accepts(issuer, kind, CURRENCIES.brl)
            );
        return found === undefined ? null : found.id;
    }

    public async duplicates(probes: readonly (TitleProbe | null)[]): Promise<boolean[]> {
        const existing: FixedIncomeTitle[] = await this.titles.listReal();
        return probes.map(
            (probe: TitleProbe | null): boolean =>
                probe !== null && existing.some((title: FixedIncomeTitle): boolean => sameTitle(probe, title))
        );
    }

    public async createAll(
        drafts: readonly ImportedTitleDraft[],
        importId: string,
        holderUserId: string | null
    ): Promise<readonly string[]> {
        if (drafts.length === 0) {
            return [];
        }
        await this.assertRoom(drafts.length);
        if (holderUserId !== null) {
            await this.members.requireActive(holderUserId);
        }
        const ids: string[] = [];
        for (const draft of drafts) {
            ids.push(await this.createOne(draft, importId, holderUserId));
        }
        return ids;
    }

    public async removeByImport(importId: string): Promise<number> {
        const created: FixedIncomeTitle[] = await this.titles.listByImport(importId);
        for (const title of created) {
            await this.titles.remove(title.id);
            await this.assignments.release(SUBJECT_TYPE, title.id);
            this.logs.titleChanged(TITLE_ACTIONS.deleted, title.id, title.kind, title.indexer);
        }
        return created.length;
    }

    private async createOne(draft: ImportedTitleDraft, importId: string, holderUserId: string | null): Promise<string> {
        const full: TitleDraft = { ...draft, currency: CURRENCIES.brl, holderUserId };
        assertValidTerms(full, DateUtil.todayInBrazil());
        this.assertIssuer(full);
        const classId: string = (await this.classResolver.resolveBySystemKey(SUGGESTED_CLASS_KEY_BY_INDEXER[draft.indexer])).id;
        const created: FixedIncomeTitle = await this.titles.createImported(full, importId);
        await this.assignments.assign(SUBJECT_TYPE, created.id, classId);
        this.logs.titleChanged(TITLE_ACTIONS.created, created.id, created.kind, created.indexer);
        return created.id;
    }

    private async assertRoom(incoming: number): Promise<void> {
        if ((await this.titles.count()) + incoming > MAX_TITLES_PER_COMPANY) {
            throw new TitleLimitReachedError(MAX_TITLES_PER_COMPANY);
        }
    }

    private assertIssuer(draft: TitleDraft): void {
        if (draft.issuerId === null) {
            return;
        }
        const issuer: Issuer | null = this.issuers.find(draft.issuerId);
        if (issuer === null) {
            throw new UnknownIssuerError(draft.issuerId);
        }
        if (!this.issuers.accepts(issuer, draft.kind, draft.currency)) {
            throw new IssuerKindMismatchError(draft.kind, issuer.kind);
        }
    }
}
