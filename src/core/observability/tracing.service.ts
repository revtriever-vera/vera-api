import { Injectable } from '@nestjs/common';
import { Context, Span, SpanStatusCode, context, propagation, trace } from '@opentelemetry/api';

export type SpanAttributes = Readonly<Record<string, string | number | boolean>>;

const TRACER_NAME: string = 'vera-api';

@Injectable()
export class TracingService {
    public currentTraceId(): string | null {
        const span: Span | undefined = trace.getActiveSpan();
        const traceId: string | undefined = span?.spanContext().traceId;
        return traceId && traceId !== '00000000000000000000000000000000' ? traceId : null;
    }

    public annotate(attributes: SpanAttributes): void {
        trace.getActiveSpan()?.setAttributes(attributes);
    }

    public async withSpan<T>(name: string, attributes: SpanAttributes, fn: () => Promise<T>): Promise<T> {
        return trace.getTracer(TRACER_NAME).startActiveSpan(name, { attributes }, async (span: Span) => {
            try {
                const result: T = await fn();
                span.setStatus({ code: SpanStatusCode.OK });
                return result;
            } catch (error) {
                span.recordException(error as Error);
                span.setStatus({ code: SpanStatusCode.ERROR });
                throw error;
            } finally {
                span.end();
            }
        });
    }

    public inject(): Record<string, string> {
        const carrier: Record<string, string> = {};
        propagation.inject(context.active(), carrier);
        return carrier;
    }

    public async continueFrom<T>(
        carrier: Readonly<Record<string, string>>,
        name: string,
        attributes: SpanAttributes,
        fn: () => Promise<T>
    ): Promise<T> {
        const parent: Context = propagation.extract(context.active(), carrier);
        return context.with(parent, async () =>
            trace.getTracer(TRACER_NAME).startActiveSpan(name, { attributes }, async (span: Span) => {
                try {
                    const result: T = await fn();
                    span.setStatus({ code: SpanStatusCode.OK });
                    return result;
                } catch (error) {
                    span.recordException(error as Error);
                    span.setStatus({ code: SpanStatusCode.ERROR });
                    throw error;
                } finally {
                    span.end();
                }
            })
        );
    }
}
