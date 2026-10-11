import { DateUtil } from '../../../shared/utils/date.util';
import { decimalStringOf, toMinor } from '../../../shared/utils/decimal.util';
import { IngestionBatch } from '../../transactions/services/transaction-ingestion.service';
import { PluggyMerchant, PluggyParty, PluggyTransaction } from '../ports/pluggy-client.port';
import { addMonthsClamped, isDateOnly } from './date-math';

export type IncomingTransaction = IngestionBatch['items'][number];

export const PLUGGY_CREDIT_SIGN: number = -1;
export const PLUGGY_POSTED_STATUS: string = 'POSTED';
export const PLUGGY_EXTERNAL_PREFIX: string = 'pluggy:';

const DESCRIPTION_MAX_LENGTH: number = 200;
const NON_DIGITS: RegExp = /\D/g;

export interface TransactionMappingContext {
    readonly currency: string;
    readonly credit: boolean;
    readonly shiftInstallmentDates: boolean;
}

export interface MappedTransactions {
    readonly items: IncomingTransaction[];
    readonly skippedPending: number;
}

interface Counterparty {
    readonly name: string | null;
    readonly document: string | null;
}

function blankToNull(value: string | null | undefined): string | null {
    const trimmed: string = (value ?? '').trim();
    return trimmed.length === 0 ? null : trimmed;
}

function digitsOrNull(value: string | null | undefined): string | null {
    const digits: string = (value ?? '').replace(NON_DIGITS, '');
    return digits.length === 0 ? null : digits;
}

export function amountMinorOf(transaction: PluggyTransaction, context: TransactionMappingContext): number {
    const value: number = transaction.amountInAccountCurrency ?? transaction.amount;
    const minor: number = toMinor(decimalStringOf(value), context.currency);
    return context.credit ? minor * PLUGGY_CREDIT_SIGN : minor;
}

export function localDateOf(instant: string): string {
    if (isDateOnly(instant)) {
        return instant;
    }
    const parsed: Date = new Date(instant);
    return Number.isNaN(parsed.getTime()) ? instant : DateUtil.localDateIn(DateUtil.BRAZIL_TIMEZONE, parsed);
}

function dateOf(transaction: PluggyTransaction, context: TransactionMappingContext): string {
    const date: string = localDateOf(transaction.date);
    const shift: number = (transaction.installmentNumber ?? 1) - 1;
    return context.shiftInstallmentDates && shift > 0 ? addMonthsClamped(date, shift) : date;
}

function partyOf(transaction: PluggyTransaction, outgoing: boolean): PluggyParty | null {
    const party: PluggyParty | null | undefined = outgoing ? transaction.paymentData?.receiver : transaction.paymentData?.payer;
    return party ?? null;
}

function merchantOf(merchant: PluggyMerchant | null): Counterparty {
    return {
        name: blankToNull(merchant?.businessName) ?? blankToNull(merchant?.name),
        document: digitsOrNull(merchant?.cnpj)
    };
}

function counterpartyOf(transaction: PluggyTransaction, outgoing: boolean): Counterparty {
    const party: PluggyParty | null = partyOf(transaction, outgoing);
    if (party !== null && (blankToNull(party.name) !== null || digitsOrNull(party.documentNumber) !== null)) {
        return { name: blankToNull(party.name), document: digitsOrNull(party.documentNumber) };
    }
    return merchantOf(transaction.merchant);
}

export function mapTransaction(transaction: PluggyTransaction, context: TransactionMappingContext): IncomingTransaction {
    const amountMinor: number = amountMinorOf(transaction, context);
    const counterparty: Counterparty = counterpartyOf(transaction, amountMinor < 0);
    return {
        externalId: `${PLUGGY_EXTERNAL_PREFIX}${transaction.id}`,
        date: dateOf(transaction, context),
        amountMinor,
        currency: context.currency,
        description: (blankToNull(transaction.descriptionRaw) ?? transaction.description).slice(0, DESCRIPTION_MAX_LENGTH),
        counterpartyName: counterparty.name,
        counterpartyDocument: counterparty.document,
        providerCategoryId: transaction.categoryId,
        installmentNumber: transaction.installmentNumber,
        installmentTotal: transaction.installmentTotal
    };
}

export function mapTransactions(transactions: readonly PluggyTransaction[], context: TransactionMappingContext): MappedTransactions {
    const posted: PluggyTransaction[] = transactions.filter(
        (transaction: PluggyTransaction): boolean => transaction.status === PLUGGY_POSTED_STATUS
    );
    return {
        items: posted.map((transaction: PluggyTransaction): IncomingTransaction => mapTransaction(transaction, context)),
        skippedPending: transactions.length - posted.length
    };
}
