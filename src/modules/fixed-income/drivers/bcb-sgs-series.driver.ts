import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { z } from 'zod';
import { SeriesPoint } from '../domain/curve/curve.types';
import { IndexSourceError } from '../domain/fixed-income.errors';
import { INDEX_SERIES, IndexSeriesName } from '../domain/index-series';
import { fixedIncomeConfig } from '../config/fixed-income.config';
import { IndexSeriesSourcePort } from '../ports/index-series-source.port';

const SGS_DATE: RegExp = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const SGS_VALUE: RegExp = /^-?\d+(\.\d+)?$/;
const RETRYABLE_STATUS_FLOOR: number = 500;
const TOO_MANY_REQUESTS: number = 429;

const responseSchema: z.ZodType<Array<{ data: string; valor: string }>> = z.array(
    z.object({ data: z.string().regex(SGS_DATE), valor: z.string().regex(SGS_VALUE) })
);

type Attempt =
    { readonly ok: true; readonly points: SeriesPoint[] } | { readonly ok: false; readonly reason: string; readonly retry: boolean };

export function toSgsDate(isoDate: string): string {
    const [year, month, day]: string[] = isoDate.split('-') as [string, string, string];
    return `${day}/${month}/${year}`;
}

export function fromSgsDate(sgsDate: string): string {
    const [day, month, year]: string[] = sgsDate.split('/') as [string, string, string];
    return `${year}-${month}-${day}`;
}

@Injectable()
export class BcbSgsSeriesDriver extends IndexSeriesSourcePort {
    public readonly source: string = 'bcb-sgs';

    public constructor(@Inject(fixedIncomeConfig.KEY) private readonly config: ConfigType<typeof fixedIncomeConfig>) {
        super();
    }

    public async fetch(series: IndexSeriesName, from: string, to: string): Promise<SeriesPoint[]> {
        const url: string = this.urlFor(series, from, to);
        let lastReason: string = 'unknown';
        for (let attempt: number = 1; attempt <= this.config.SGS_MAX_ATTEMPTS; attempt += 1) {
            const result: Attempt = await this.attempt(url);
            if (result.ok) {
                return result.points;
            }
            lastReason = result.reason;
            if (!result.retry) {
                break;
            }
            await this.backoff(attempt);
        }
        throw new IndexSourceError(series, lastReason);
    }

    private urlFor(series: IndexSeriesName, from: string, to: string): string {
        const code: number = series === INDEX_SERIES.cdiDaily ? this.config.SGS_CDI_SERIES_CODE : this.config.SGS_IPCA_SERIES_CODE;
        const base: string = this.config.SGS_BASE_URL.replace(/\/+$/, '');
        return `${base}/dados/serie/bcdata.sgs.${String(code)}/dados?formato=json&dataInicial=${toSgsDate(from)}&dataFinal=${toSgsDate(to)}`;
    }

    private async attempt(url: string): Promise<Attempt> {
        try {
            const response: Response = await fetch(url, { signal: AbortSignal.timeout(this.config.SGS_TIMEOUT_MS) });
            if (response.status >= RETRYABLE_STATUS_FLOOR || response.status === TOO_MANY_REQUESTS) {
                return { ok: false, reason: `status_${String(response.status)}`, retry: true };
            }
            if (!response.ok) {
                return { ok: false, reason: `status_${String(response.status)}`, retry: false };
            }
            return this.parse(await response.json());
        } catch {
            return { ok: false, reason: 'network_error', retry: true };
        }
    }

    private parse(body: unknown): Attempt {
        const parsed: ReturnType<typeof responseSchema.safeParse> = responseSchema.safeParse(body);
        if (!parsed.success) {
            return { ok: false, reason: 'invalid_payload', retry: false };
        }
        return {
            ok: true,
            points: parsed.data.map((entry): SeriesPoint => ({ date: fromSgsDate(entry.data), value: entry.valor }))
        };
    }

    private async backoff(attempt: number): Promise<void> {
        if (attempt >= this.config.SGS_MAX_ATTEMPTS || this.config.SGS_RETRY_BASE_DELAY_MS === 0) {
            return;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, this.config.SGS_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)));
    }
}
