import { Injectable } from '@nestjs/common';
import { compareCodeUnits } from '../../../shared/utils/compare-code-units';
import { UnknownNoticeTypeError } from '../domain/notices.errors';
import { NoticeTypeDefinition } from '../domain/notices.types';

@Injectable()
export class NoticeTypeRegistry {
    private readonly definitions: Map<string, NoticeTypeDefinition> = new Map();

    public register(definition: NoticeTypeDefinition): void {
        this.definitions.set(definition.type, definition);
    }

    public require(type: string): NoticeTypeDefinition {
        const definition: NoticeTypeDefinition | undefined = this.definitions.get(type);
        if (definition === undefined) {
            throw new UnknownNoticeTypeError(type);
        }
        return definition;
    }

    public has(type: string): boolean {
        return this.definitions.has(type);
    }

    public types(): string[] {
        return [...this.definitions.keys()].sort(compareCodeUnits);
    }
}
