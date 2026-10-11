import { CallHandler, ExecutionContext, Injectable, NestInterceptor, PayloadTooLargeException, Type } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Observable } from 'rxjs';
import { FileTooLargeError } from '../../domain/statement-import.errors';
import { MAX_FIELD_BYTES, MAX_FILE_BYTES, MAX_MULTIPART_FIELDS } from '../../domain/statement-import.types';

const UPLOAD_OPTIONS: Record<string, unknown> = {
    limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: MAX_MULTIPART_FIELDS, fieldSize: MAX_FIELD_BYTES },
    defParamCharset: 'utf8'
};

const BaseInterceptor: Type<NestInterceptor> = FileInterceptor('file', UPLOAD_OPTIONS);

@Injectable()
export class StatementUploadInterceptor extends BaseInterceptor {
    public override async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
        try {
            return await super.intercept(context, next);
        } catch (error) {
            throw error instanceof PayloadTooLargeException ? new FileTooLargeError(MAX_FILE_BYTES) : error;
        }
    }
}
