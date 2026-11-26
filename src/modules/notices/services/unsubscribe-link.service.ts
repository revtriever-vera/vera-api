import { timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { HmacPort } from '../../../core/crypto/hmac.port';
import { publicApiUrl } from '../../../shared/utils/public-api-url';
import { IdUtil } from '../../../shared/utils/id.util';
import { noticesConfig } from '../config/notices.config';
import { InvalidUnsubscribeTokenError } from '../domain/notices.errors';

export interface UnsubscribeSubject {
    readonly companyId: string;
    readonly userId: string;
    /** One notice type, or several joined by a comma when the link turns off every type of a grouped e-mail. */
    readonly type: string;
}

const SEPARATOR: string = '.';
const TYPE_PATTERN: RegExp = /^[a-z][a-z0-9_]{0,63}(,[a-z][a-z0-9_]{0,63}){0,15}$/;

function isSubjectParts(parts: string[]): parts is [string, string, string] {
    return parts.length === 3 && IdUtil.isId(parts[0] ?? '') && IdUtil.isId(parts[1] ?? '') && TYPE_PATTERN.test(parts[2] ?? '');
}

@Injectable()
export class UnsubscribeLinkService {
    public constructor(
        private readonly hmac: HmacPort,
        @Inject(noticesConfig.KEY) private readonly config: ConfigType<typeof noticesConfig>
    ) {}

    public tokenFor(subject: UnsubscribeSubject): string {
        const body: string = Buffer.from(`${subject.companyId}${SEPARATOR}${subject.userId}${SEPARATOR}${subject.type}`).toString(
            'base64url'
        );
        return `${body}${SEPARATOR}${this.hmac.sha256Hex(body)}`;
    }

    public urlFor(subject: UnsubscribeSubject): string {
        return publicApiUrl(this.config.PUBLIC_API_URL, `notifications/unsubscribe/${this.tokenFor(subject)}`);
    }

    public appUrl(): string {
        return this.config.APP_URL;
    }

    public pageUrlOf(token: string): string {
        return `${this.config.APP_URL}/avisos/sair/${encodeURIComponent(token)}`;
    }

    public verify(token: string): UnsubscribeSubject {
        const [body, signature, ...rest]: string[] = token.split(SEPARATOR);
        if (body === undefined || signature === undefined || rest.length > 0 || !this.signatureMatches(body, signature)) {
            throw new InvalidUnsubscribeTokenError();
        }
        return this.subjectOf(body);
    }

    private subjectOf(body: string): UnsubscribeSubject {
        const parts: string[] = Buffer.from(body, 'base64url').toString().split(SEPARATOR);
        if (!isSubjectParts(parts)) {
            throw new InvalidUnsubscribeTokenError();
        }
        return { companyId: parts[0], userId: parts[1], type: parts[2] };
    }

    private signatureMatches(body: string, signature: string): boolean {
        const expected: Buffer = Buffer.from(this.hmac.sha256Hex(body));
        const received: Buffer = Buffer.from(signature);
        return expected.length === received.length && timingSafeEqual(expected, received);
    }
}
