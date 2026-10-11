import { describe, expect, it } from 'vitest';
import { UnknownMailTemplateError } from './mail.errors';
import { MailContent } from './mail.types';
import { TemplateProps, TemplateRegistry } from './template.registry';

function sampleRenderer(subject: string): (props: TemplateProps) => MailContent {
    return (props: TemplateProps): MailContent => ({ subject, html: `<p>${props['name'] ?? ''}</p>`, text: props['name'] ?? '' });
}

describe('TemplateRegistry', () => {
    it('renders the renderer registered for the exact (name, locale) pair', () => {
        const registry: TemplateRegistry = new TemplateRegistry();
        registry.register('sample', 'en', sampleRenderer('Sample subject'));

        const content: MailContent = registry.render('sample', 'en', { name: 'Ana' });

        expect(content).toEqual({ subject: 'Sample subject', html: '<p>Ana</p>', text: 'Ana' });
    });

    it('falls back to the pt-BR renderer when the requested locale has none registered', () => {
        const registry: TemplateRegistry = new TemplateRegistry();
        registry.register('sample', 'pt-BR', sampleRenderer('Assunto de exemplo'));

        const content: MailContent = registry.render('sample', 'en', { name: 'Ana' });

        expect(content.subject).toBe('Assunto de exemplo');
    });

    it('throws UnknownMailTemplateError when neither the locale nor pt-BR are registered', () => {
        const registry: TemplateRegistry = new TemplateRegistry();

        expect(() => registry.render('missing', 'en', {})).toThrow(UnknownMailTemplateError);
    });
});
