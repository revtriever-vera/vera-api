import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { zodToOpenAPI } from 'nestjs-zod';
import { problemSchema } from './validation/problem.schema';

export interface ProblemDoc {
    readonly status: number;
    readonly description: string;
    readonly example?: Readonly<Record<string, unknown>>;
}

export function ApiProblemResponse(doc: ProblemDoc): MethodDecorator {
    return applyDecorators(
        ApiResponse({
            status: doc.status,
            description: doc.description,
            schema: { ...zodToOpenAPI(problemSchema), example: doc.example }
        })
    );
}
