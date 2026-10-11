import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { zodToOpenAPI } from 'nestjs-zod';
import { ZodObject, ZodRawShape, ZodTypeAny } from 'zod';

export interface ZodResponseDoc {
    readonly status: number;
    readonly description: string;
    readonly schema: ZodTypeAny;
}

export function ApiZodBody(schema: ZodTypeAny): MethodDecorator {
    return applyDecorators(ApiBody({ schema: zodToOpenAPI(schema) }));
}

export function ApiZodQuery(schema: ZodObject<ZodRawShape>): MethodDecorator {
    const decorators: MethodDecorator[] = Object.entries(schema.shape).map(([name, field]: [string, ZodTypeAny]) =>
        ApiQuery({
            name,
            required: !field.isOptional(),
            description: field.description,
            schema: zodToOpenAPI(field)
        })
    );
    return applyDecorators(...decorators);
}

export function ApiZodResponse(doc: ZodResponseDoc): MethodDecorator {
    return applyDecorators(
        ApiResponse({
            status: doc.status,
            description: doc.description,
            schema: zodToOpenAPI(doc.schema)
        })
    );
}
