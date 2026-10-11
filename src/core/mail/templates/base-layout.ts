export interface BaseLayoutInput {
    readonly title: string;
    readonly heading?: string | null;
    readonly bodyHtml: string;
    readonly ctaLabel?: string;
    readonly ctaUrl?: string;
    readonly footnote?: string;
    readonly unsubscribeUrl?: string;
}

const BRAND: string = '#16A34A';
const BRAND_DEEP: string = '#0F172A';
const BRAND_SOFT: string = '#ECFDF5';
const INK: string = '#0F172A';
const INK_SOFT: string = '#414b5e';
const INK_SUBTLE: string = '#78829a';
const CANVAS: string = '#f5f7fa';
const BORDER: string = '#dfe4ec';

function cta(label: string, url: string): string {
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0">
        <tr><td align="center" bgcolor="${BRAND}" style="border-radius:8px">
            <a href="${url}" style="display:inline-block;padding:13px 28px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px">${label}</a>
        </td></tr>
    </table>`;
}

function banner(): string {
    return `<tr><td style="background-color:${BRAND_DEEP};padding:22px 40px">
        <span style="font-family:Helvetica,Arial,sans-serif;font-size:21px;font-weight:bold;color:${BRAND_SOFT};letter-spacing:-0.3px">Vera</span>
    </td></tr>`;
}

function unsubscribeLine(url: string): string {
    return `<br><a href="${url}" style="color:${INK_SUBTLE};text-decoration:underline">Não quero mais receber estes avisos</a>`;
}

function headingOf(input: BaseLayoutInput): string {
    const heading: string = input.heading === undefined ? input.title : (input.heading ?? '');
    return heading === ''
        ? ''
        : `<h1 style="margin:0 0 18px;font-family:Helvetica,Arial,sans-serif;font-size:21px;line-height:1.3;color:${INK}">${heading}</h1>`;
}

function footnoteOf(footnote: string | undefined): string {
    return footnote
        ? `<p style="margin:24px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${INK_SUBTLE}">${footnote}</p>`
        : '';
}

function contentBlockOf(input: BaseLayoutInput, button: string, footnote: string): string {
    return `<tr><td style="padding:36px 40px 40px">
        ${headingOf(input)}
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:${INK_SOFT}">${input.bodyHtml}</div>
        ${button}
        ${footnote}
    </td></tr>`;
}

function footerOf(unsubscribe: string): string {
    return `<tr><td style="border-top:1px solid ${BORDER};padding:20px 40px;background-color:#fbfcfe">
        <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${INK_SUBTLE}">
            Vera.<br>
            Este e-mail foi enviado automaticamente.${unsubscribe}
        </p>
    </td></tr>`;
}

export function baseLayout(input: BaseLayoutInput): string {
    const button: string = input.ctaLabel && input.ctaUrl ? cta(input.ctaLabel, input.ctaUrl) : '';
    const unsubscribe: string = input.unsubscribeUrl ? unsubscribeLine(input.unsubscribeUrl) : '';
    const footnote: string = footnoteOf(input.footnote);
    return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${input.title}</title></head>
<body style="margin:0;padding:0;background-color:${CANVAS}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CANVAS}">
        <tr><td align="center" style="padding:32px 16px">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border:1px solid ${BORDER};border-radius:12px;overflow:hidden">
                ${banner()}
                ${contentBlockOf(input, button, footnote)}
                ${footerOf(unsubscribe)}
            </table>
        </td></tr>
    </table>
</body>
</html>`;
}
