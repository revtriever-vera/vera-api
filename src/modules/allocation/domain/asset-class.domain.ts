import { Injectable } from '@nestjs/common';
import { isUniqueViolationError } from '../../../core/database/database.errors';
import { AssetClassesRepository } from '../repositories/asset-classes.repository';
import { ClassNameTakenError } from './allocation.errors';
import { AssetClass } from './allocation.types';
import { nextColorKey } from './class-color';
import { DEFAULT_CLASSES, DEFAULT_SYSTEM_KEYS } from './default-classes';
import { ClassTargetUpdate } from './targets';

export interface CreateClassInput {
    readonly name: string;
    readonly colorKey?: string;
}

export interface UpdateClassInput {
    readonly name?: string | null;
    readonly colorKey?: string;
}

export interface AbsorbInput {
    readonly destination: AssetClass;
    readonly origin: AssetClass;
    readonly targetBps: number;
}

@Injectable()
export class AssetClassDomain {
    public constructor(private readonly classes: AssetClassesRepository) {}

    public async ensureDefaults(): Promise<AssetClass[]> {
        const seeded: number = await this.classes.countSeededIncludingDeleted(DEFAULT_SYSTEM_KEYS);
        if (seeded >= DEFAULT_CLASSES.length) {
            return [];
        }
        return this.classes.insertSeedsIfMissing(DEFAULT_CLASSES);
    }

    public async listActive(): Promise<AssetClass[]> {
        return this.classes.listOrdered();
    }

    public async findById(id: string): Promise<AssetClass | null> {
        return this.classes.findById(id);
    }

    public async create(input: CreateClassInput, existing: readonly AssetClass[]): Promise<AssetClass> {
        const sortOrder: number = existing.reduce((highest: number, item: AssetClass) => Math.max(highest, item.sortOrder), 0) + 1;
        const colorKey: string = input.colorKey ?? nextColorKey(existing.map((item: AssetClass) => item.colorKey));
        return this.guardingName(async () => this.classes.create({ name: input.name, colorKey, sortOrder }));
    }

    public async update(id: string, input: UpdateClassInput): Promise<AssetClass | null> {
        return this.guardingName(async () => this.classes.updateFields(id, { name: input.name, colorKey: input.colorKey }));
    }

    public async absorb(input: AbsorbInput): Promise<AssetClass | null> {
        const inherited: string[] = [...input.origin.aliasKeys, ...(input.origin.systemKey === null ? [] : [input.origin.systemKey])];
        const aliasKeys: string[] = [...new Set<string>([...input.destination.aliasKeys, ...inherited])];
        const merged: AssetClass | null = await this.classes.updateFields(input.destination.id, { targetBps: input.targetBps, aliasKeys });
        await this.classes.softDelete(input.origin.id);
        return merged;
    }

    public async applyTargets(updates: readonly ClassTargetUpdate[]): Promise<void> {
        await this.classes.setTargets(updates);
    }

    public async remove(id: string): Promise<void> {
        await this.classes.softDelete(id);
    }

    private async guardingName<T>(operation: () => Promise<T>): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (isUniqueViolationError(error)) {
                throw new ClassNameTakenError();
            }
            throw error;
        }
    }
}
