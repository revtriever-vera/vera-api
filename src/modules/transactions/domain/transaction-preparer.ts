import { COUNTERPARTY_NAME_MAX_LENGTH, DESCRIPTION_MAX_LENGTH, IncomingTransaction, PreparedTransaction } from './transactions.types';
import { isValidDate } from './calendar';

const NON_DIGITS: RegExp = /\D/g;
const EXTERNAL_ID_MAX_LENGTH: number = 200;
const PROVIDER_CATEGORY_MAX_LENGTH: number = 40;
const MAX_INSTALLMENTS: number = 999;

export interface PreparationTools {
    readonly normalize: (text: string) => string;
    readonly hashDocument: (digits: string) => string;
}

export function isIngestible(item: IncomingTransaction): boolean {
    return (
        item.externalId.length > 0 &&
        item.externalId.length <= EXTERNAL_ID_MAX_LENGTH &&
        isValidDate(item.date) &&
        Number.isSafeInteger(item.amountMinor) &&
        item.amountMinor !== 0 &&
        item.description.trim().length > 0
    );
}

export function documentDigits(document: string | null | undefined): string {
    return (document ?? '').replace(NON_DIGITS, '');
}

function textOrNull(value: string | null | undefined, maxLength: number): string | null {
    const trimmed: string = (value ?? '').trim().slice(0, maxLength);
    return trimmed.length === 0 ? null : trimmed;
}

function installmentOf(item: IncomingTransaction): { number: number | null; total: number | null } {
    const number: number = item.installmentNumber ?? 0;
    const total: number = item.installmentTotal ?? 0;
    const valid: boolean =
        number >= 1 && number <= total && total <= MAX_INSTALLMENTS && Number.isInteger(number) && Number.isInteger(total);
    return valid ? { number, total } : { number: null, total: null };
}

export function prepare(item: IncomingTransaction, tools: PreparationTools): PreparedTransaction {
    const description: string = item.description.trim().slice(0, DESCRIPTION_MAX_LENGTH);
    const digits: string = documentDigits(item.counterpartyDocument);
    const installment: { number: number | null; total: number | null } = installmentOf(item);
    return {
        externalId: item.externalId,
        date: item.date,
        amountMinor: item.amountMinor,
        description,
        normalizedDescription: tools.normalize(description),
        counterpartyName: textOrNull(item.counterpartyName, COUNTERPARTY_NAME_MAX_LENGTH),
        counterpartyKey: digits.length === 0 ? null : tools.hashDocument(digits),
        providerCategoryId: textOrNull(item.providerCategoryId, PROVIDER_CATEGORY_MAX_LENGTH),
        installmentNumber: installment.number,
        installmentTotal: installment.total
    };
}

export function compareByDateAndExternalId(left: PreparedTransaction, right: PreparedTransaction): number {
    if (left.date !== right.date) {
        return left.date < right.date ? -1 : 1;
    }
    if (left.externalId === right.externalId) {
        return 0;
    }
    return left.externalId < right.externalId ? -1 : 1;
}
