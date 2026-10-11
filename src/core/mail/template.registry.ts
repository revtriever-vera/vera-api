import { Injectable } from '@nestjs/common';
import { AppLocale, DEFAULT_LOCALE } from '../../shared/i18n/locale';
import { UnknownMailTemplateError } from './mail.errors';
import { MailContent } from './mail.types';

export type TemplateProps = Readonly<Record<string, string>>;
export type TemplateRenderer = (props: TemplateProps) => MailContent;

function keyOf(name: string, locale: AppLocale): string {
    return `${name}:${locale}`;
}

@Injectable()
export class TemplateRegistry {
    private readonly templates: Map<string, TemplateRenderer> = new Map();

    public register(name: string, locale: AppLocale, renderer: TemplateRenderer): void {
        this.templates.set(keyOf(name, locale), renderer);
    }

    public render(name: string, locale: AppLocale, props: TemplateProps): MailContent {
        const renderer: TemplateRenderer | undefined =
            this.templates.get(keyOf(name, locale)) ?? this.templates.get(keyOf(name, DEFAULT_LOCALE));
        if (!renderer) {
            throw new UnknownMailTemplateError(name);
        }
        return renderer(props);
    }
}
