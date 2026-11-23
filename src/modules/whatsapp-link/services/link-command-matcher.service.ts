import { Injectable } from '@nestjs/common';
import { parseLinkMessage } from '../domain/link-message';
import { parseOptOut } from '../domain/opt-out';

@Injectable()
export class LinkCommandMatcher {
    public isLinkCommand(text: string): boolean {
        return parseLinkMessage(text) !== null || parseOptOut(text) !== null;
    }
}
