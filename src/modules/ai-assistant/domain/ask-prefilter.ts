export type PrefilterVerdict = 'refusal' | 'greeting' | null;

const PAY_COMMAND: RegExp =
    /(?<![\p{L}\p{N}_])(?:pague|pagar|pagamento|transfira|transferir|transfere|transfer|pay|send|wire)(?![\p{L}\p{N}_])/iu;
const PIX_COMMAND: RegExp =
    /(?<![\p{L}\p{N}_])(?:faz|fazer|fa[cç]a|manda|mandar|envia|enviar|make|do)(?![\p{L}\p{N}_]).*(?<![\p{L}\p{N}_])(?:pix|boleto)(?![\p{L}\p{N}_])/isu;
const PIX_WITH_AMOUNT: RegExp = /(?<![\p{L}\p{N}_])pix(?![\p{L}\p{N}_]).*(?:R\$|US\$|\$)\s*\d/isu;
const BOLETO: RegExp = /(?<![\p{L}\p{N}_])boleto(?![\p{L}\p{N}_])/iu;
const REMINDER_ASK: RegExp = /(?<![\p{L}\p{N}_])me\s+(?:lembr|avis)(?:a|e|ar)(?![\p{L}\p{N}_])/iu;
const REMINDER_WORD: RegExp = /(?<![\p{L}\p{N}_])(?:lembra[- ]me|lembrete|remind(?:er)?)(?![\p{L}\p{N}_])/iu;
const GREETING: RegExp =
    /^(?:oi+|ol[aá]|oie|e a[ií]|bom dia|boa tarde|boa noite|hi|hello|hey|good (?:morning|afternoon|evening))[\s!.,?]*$/iu;
const SPENDING_QUESTION: RegExp = /(?<![\p{L}\p{N}_])(?:quanto|quantos|qual|quais|how much|how many|what)(?![\p{L}\p{N}_])/iu;

function asksAboutSpending(text: string): boolean {
    return SPENDING_QUESTION.test(text) || text.trim().endsWith('?');
}

/** "Me lembra de pagar o condomínio" cria um lembrete: não paga nada, então não é pedido de pagamento. */
export function isReminderRequest(text: string): boolean {
    return REMINDER_ASK.test(text) || REMINDER_WORD.test(text);
}

function isPaymentRequest(text: string): boolean {
    if (isReminderRequest(text)) {
        return false;
    }
    if (PAY_COMMAND.test(text) || PIX_COMMAND.test(text) || PIX_WITH_AMOUNT.test(text)) {
        return true;
    }
    return BOLETO.test(text) && !asksAboutSpending(text);
}

export function prefilterOf(text: string): PrefilterVerdict {
    if (GREETING.test(text.trim())) {
        return 'greeting';
    }
    return isPaymentRequest(text) ? 'refusal' : null;
}
