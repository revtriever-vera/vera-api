import { ClassNotFoundError, TargetsIncompleteError, TargetsMustSum100Error } from './allocation.errors';
import { AssetClass, ClassAssignment, TOTAL_BPS } from './allocation.types';
import { DEFAULT_CLASSES, DefaultClassSeed } from './default-classes';

export interface ClassTargetInput {
    readonly classId: string;
    readonly targetBps: number;
}

export interface AssetTargetInput {
    readonly subjectType: string;
    readonly subjectId: string;
    readonly targetInClassBps: number;
}

export interface ClassTargetUpdate {
    readonly classId: string;
    readonly targetBps: number;
}

export interface AssetTargetUpdate {
    readonly assignmentId: string;
    readonly targetInClassBps: number;
}

export function sumOf(values: readonly number[]): number {
    return values.reduce((total: number, value: number) => total + value, 0);
}

export function sumsTo(values: readonly number[], total: number): boolean {
    return sumOf(values) === total;
}

export function resolveClassTargets(classes: readonly AssetClass[], inputs: readonly ClassTargetInput[]): ClassTargetUpdate[] {
    const known: Set<string> = new Set<string>(classes.map((item: AssetClass) => item.id));
    const unknown: ClassTargetInput | undefined = inputs.find((input: ClassTargetInput) => !known.has(input.classId));
    if (unknown !== undefined) {
        throw new ClassNotFoundError(unknown.classId);
    }
    const requested: Map<string, number> = new Map<string, number>(
        inputs.map((input: ClassTargetInput): [string, number] => [input.classId, input.targetBps])
    );
    const resulting: ClassTargetUpdate[] = classes.map((item: AssetClass) => ({
        classId: item.id,
        targetBps: requested.get(item.id) ?? item.targetBps
    }));
    assertSumsTo100(resulting.map((update: ClassTargetUpdate) => update.targetBps));
    return resulting;
}

export function resolveAssetTargets(
    classId: string,
    assignments: readonly ClassAssignment[],
    inputs: readonly AssetTargetInput[]
): AssetTargetUpdate[] {
    const requested: Map<string, number> = new Map<string, number>(
        inputs.map((input: AssetTargetInput): [string, number] => [subjectKey(input.subjectType, input.subjectId), input.targetInClassBps])
    );
    if (!listsEveryAssignmentOnce(assignments, inputs.length, requested)) {
        throw new TargetsIncompleteError(classId);
    }
    const updates: AssetTargetUpdate[] = assignments.map((assignment: ClassAssignment) => ({
        assignmentId: assignment.id,
        targetInClassBps: requested.get(subjectKey(assignment.subjectType, assignment.subjectId)) ?? 0
    }));
    const values: number[] = updates.map((update: AssetTargetUpdate) => update.targetInClassBps);
    if (sumOf(values) !== 0) {
        assertSumsTo100(values);
    }
    return updates;
}

function listsEveryAssignmentOnce(
    assignments: readonly ClassAssignment[],
    listed: number,
    requested: ReadonlyMap<string, number>
): boolean {
    const expected: Set<string> = new Set<string>(
        assignments.map((assignment: ClassAssignment) => subjectKey(assignment.subjectType, assignment.subjectId))
    );
    return listed === assignments.length && requested.size === listed && [...requested.keys()].every((key: string) => expected.has(key));
}

export function moderateTargets(classes: readonly AssetClass[]): ClassTargetUpdate[] {
    return classes.map((item: AssetClass) => ({ classId: item.id, targetBps: moderateTargetOf(item) }));
}

function moderateTargetOf(assetClass: AssetClass): number {
    const keys: Set<string> = new Set<string>([...assetClass.aliasKeys, ...(assetClass.systemKey === null ? [] : [assetClass.systemKey])]);
    return sumOf(
        DEFAULT_CLASSES.filter((seed: DefaultClassSeed) => keys.has(seed.systemKey)).map((seed: DefaultClassSeed) => seed.targetBps)
    );
}

function assertSumsTo100(values: readonly number[]): void {
    if (!sumsTo(values, TOTAL_BPS)) {
        throw new TargetsMustSum100Error(sumOf(values));
    }
}

function subjectKey(subjectType: string, subjectId: string): string {
    return `${subjectType}:${subjectId}`;
}
