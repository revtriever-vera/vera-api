const FORMULA_TRIGGERS: readonly string[] = ['=', '+', '-', '@', '\t', '\r'];
const NEUTRALIZER: string = "'";

export function spreadsheetSafeText(text: string): string {
    return FORMULA_TRIGGERS.some((trigger: string): boolean => text.startsWith(trigger)) ? `${NEUTRALIZER}${text}` : text;
}
