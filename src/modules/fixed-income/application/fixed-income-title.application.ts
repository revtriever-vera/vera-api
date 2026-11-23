import { Injectable } from '@nestjs/common';
import { UsingTransaction } from '../../../core/database/using-transaction.decorator';
import type { Issuer, ResolvedIssuer } from '../../issuers/domain/issuer.types';
import { IssuerDirectoryService } from '../../issuers/services/issuer-directory.service';
import { ClassAssignmentService } from '../../allocation/services/class-assignment.service';
import { ClassResolverService } from '../../allocation/services/class-resolver.service';
import { DateUtil } from '../../../shared/utils/date.util';
import { CURRENCIES, FixedIncomeValuation } from '../domain/curve/curve.types';
import { FixedIncomeTitleDomain, TitleDraft } from '../domain/fixed-income-title.domain';
import { toFixedIncomeTitleView } from '../domain/fixed-income-title.mapper';
import { IssuerKindMismatchError, TitleLimitReachedError, TitleNotFoundError, UnknownIssuerError } from '../domain/fixed-income.errors';
import {
    FixedIncomeTitle,
    FixedIncomeTitleView,
    MAX_TITLES_PER_COMPANY,
    SUGGESTED_CLASS_KEY_BY_INDEXER,
    TITLE_ACTIONS,
    TitleIssuerView
} from '../domain/fixed-income.types';
import { assertValidTerms } from '../domain/terms-validation';
import { FixedIncomeLogService } from '../services/fixed-income-log.service';
import { FixedIncomeValuationService } from '../services/fixed-income-valuation.service';
import { CreateFixedIncomeTitleDto, UpdateFixedIncomeTitleDto } from '../validation/fixed-income.schemas';

const SUBJECT_TYPE: Parameters<ClassAssignmentService['assign']>[0] = 'fixed_income';

@Injectable()
export class FixedIncomeTitleApplication {
    public constructor(
        private readonly titles: FixedIncomeTitleDomain,
        private readonly valuation: FixedIncomeValuationService,
        private readonly classResolver: ClassResolverService,
        private readonly assignments: ClassAssignmentService,
        private readonly logs: FixedIncomeLogService,
        private readonly issuers: IssuerDirectoryService
    ) {}

    public async create(input: CreateFixedIncomeTitleDto): Promise<FixedIncomeTitleView> {
        const draft: TitleDraft = {
            kind: input.kind,
            name: input.name,
            issuerId: input.issuerId ?? null,
            indexer: input.indexer,
            rateBps: input.rateBps,
            currency: input.currency ?? CURRENCIES.brl,
            appliedMinor: input.appliedMinor,
            appliedAt: input.appliedAt,
            maturityDate: input.maturityDate
        };
        assertValidTerms(draft, DateUtil.todayInBrazil());
        this.assertIssuer(draft);
        const created: FixedIncomeTitle = await this.persist(draft, input.classId);
        return this.view(created);
    }

    public async get(id: string): Promise<FixedIncomeTitleView> {
        const title: FixedIncomeTitle | null = await this.titles.findById(id);
        if (title === null) {
            throw new TitleNotFoundError(id);
        }
        return this.view(title);
    }

    public async update(id: string, patch: UpdateFixedIncomeTitleDto): Promise<FixedIncomeTitleView> {
        const current: FixedIncomeTitle | null = await this.titles.findById(id);
        if (current === null) {
            throw new TitleNotFoundError(id);
        }
        const draft: TitleDraft = { ...current, ...this.definedFields(patch) };
        assertValidTerms(draft, DateUtil.todayInBrazil());
        this.assertIssuer(draft);
        const updated: FixedIncomeTitle | null = await this.titles.update(id, draft);
        if (updated === null) {
            throw new TitleNotFoundError(id);
        }
        this.logs.titleChanged(TITLE_ACTIONS.updated, updated.id, updated.kind, updated.indexer);
        return this.view(updated);
    }

    @UsingTransaction()
    public async remove(id: string): Promise<void> {
        const title: FixedIncomeTitle | null = await this.titles.findById(id);
        if (title === null || !(await this.titles.remove(id))) {
            throw new TitleNotFoundError(id);
        }
        await this.assignments.release(SUBJECT_TYPE, id);
        this.logs.titleChanged(TITLE_ACTIONS.deleted, id, title.kind, title.indexer);
    }

    @UsingTransaction()
    private async persist(draft: TitleDraft, classId: string | undefined): Promise<FixedIncomeTitle> {
        if ((await this.titles.count()) >= MAX_TITLES_PER_COMPANY) {
            throw new TitleLimitReachedError(MAX_TITLES_PER_COMPANY);
        }
        const targetClassId: string =
            classId ?? (await this.classResolver.resolveBySystemKey(SUGGESTED_CLASS_KEY_BY_INDEXER[draft.indexer])).id;
        const created: FixedIncomeTitle = await this.titles.create(draft);
        await this.assignments.assign(SUBJECT_TYPE, created.id, targetClassId);
        this.logs.titleChanged(TITLE_ACTIONS.created, created.id, created.kind, created.indexer);
        return created;
    }

    private async view(title: FixedIncomeTitle): Promise<FixedIncomeTitleView> {
        const valuation: FixedIncomeValuation = await this.valuation.valueTitleNow(title, new Date());
        const assignments: Awaited<ReturnType<ClassAssignmentService['listForCompany']>> = await this.assignments.listForCompany();
        const classId: string =
            assignments.find((entry) => entry.subjectType === SUBJECT_TYPE && entry.subjectId === title.id)?.classId ?? '';
        return toFixedIncomeTitleView(title, classId, valuation, this.issuerView(title.issuerId));
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

    private issuerView(issuerId: string | null): TitleIssuerView | null {
        const stored: Issuer | null = issuerId === null ? null : this.issuers.find(issuerId);
        const current: ResolvedIssuer | null = stored === null ? null : this.issuers.resolve(stored.id);
        if (stored === null || current === null) {
            return null;
        }
        return {
            id: stored.id,
            name: stored.name,
            groupId: current.groupId,
            groupName: current.groupName,
            kind: stored.kind,
            fgcAssociated: current.fgcAssociated
        };
    }

    private definedFields(patch: UpdateFixedIncomeTitleDto): Partial<TitleDraft> {
        return Object.fromEntries(Object.entries(patch).filter(([, value]: [string, unknown]) => value !== undefined));
    }
}
