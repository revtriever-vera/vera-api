import { Injectable } from '@nestjs/common';
import { LLM_TASK_CATALOG } from '../catalog/llm-task.catalog';
import { LlmTaskSpec } from '../catalog/llm-task.types';
import { LlmUnknownTaskError } from '../llm.errors';

@Injectable()
export class LlmTaskRegistryService {
    private readonly byTask: ReadonlyMap<string, LlmTaskSpec> = new Map(
        LLM_TASK_CATALOG.map((spec: LlmTaskSpec): [string, LlmTaskSpec] => [spec.task, spec])
    );

    public resolve(task: string): LlmTaskSpec {
        const spec: LlmTaskSpec | undefined = this.byTask.get(task);
        if (spec === undefined) {
            throw new LlmUnknownTaskError(task);
        }
        return spec;
    }

    public list(): readonly LlmTaskSpec[] {
        return LLM_TASK_CATALOG;
    }
}
