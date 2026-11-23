import { isReminderRequest } from '../../ai-assistant/services/ask-vera.service';
import { plainOf } from './text-normalizer';

const PAYMENT_REQUEST: RegExp = /\bpix\b|transfer|\bpag(?:ar|ue|ament)|boleto|\bpay\b|\bpayments?\b/;

export function isPaymentRequest(text: string): boolean {
    return !isReminderRequest(text) && PAYMENT_REQUEST.test(plainOf(text));
}
