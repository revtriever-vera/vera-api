import { AppLocale } from '../../../shared/i18n/locale';
import { investmentNoticeText } from './ask-fixed-replies';
import { mentionsAsset } from './asset-mention';
import { AskLoopResult } from './ask-vera-loop';
import { INVESTMENT_NOTICE_TOOLS } from './ask-vera.types';

function usedNoticeTool(toolsUsed: readonly string[]): boolean {
    return toolsUsed.some((tool: string): boolean => INVESTMENT_NOTICE_TOOLS.has(tool));
}

export function needsInvestmentNotice(result: Pick<AskLoopResult, 'ending' | 'text' | 'toolsUsed'>, question: string): boolean {
    if (result.ending !== 'answered' || result.text === '') {
        return false;
    }
    return usedNoticeTool(result.toolsUsed) || mentionsAsset(question) || mentionsAsset(result.text);
}

export function withInvestmentNotice(text: string, notice: boolean, locale: AppLocale): string {
    const line: string = investmentNoticeText(locale);
    return notice ? `${text.replace(line, '').trim()}\n${line}` : text;
}
