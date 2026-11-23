export const BUTTON_PREFIXES: { readonly action: 'act'; readonly reminder: 'rem' } = { action: 'act', reminder: 'rem' };

export type ButtonId = {
    readonly prefix: string;
    readonly action: string;
    readonly id: string;
};

const BUTTON_ID: RegExp = /^([a-z]{2,8}):([a-z0-9]{2,16}):([0-9a-fA-F-]{8,64})$/;

export function buttonIdOf(prefix: string, action: string, id: string): string {
    return `${prefix}:${action}:${id}`;
}

export function parseButtonId(raw: string | undefined): ButtonId | null {
    const match: RegExpExecArray | null = raw === undefined ? null : BUTTON_ID.exec(raw.trim());
    const [, prefix, action, id] = match ?? [];
    return prefix === undefined || action === undefined || id === undefined ? null : { prefix, action, id };
}
