import { describe, expect, it } from 'vitest';
import { baseLayout } from './base-layout';

const BASE: { title: string; bodyHtml: string } = { title: 'Olá', bodyHtml: '<p>corpo</p>' };

describe('base layout', () => {
    it('carries the Vera banner and the body', () => {
        const html: string = baseLayout(BASE);

        expect(html).toContain('>Vera</span>');
        expect(html).toContain('<p>corpo</p>');
    });

    it('offers the unsubscribe line when there is a link for it', () => {
        const html: string = baseLayout({ ...BASE, unsubscribeUrl: 'https://app.vera.example/sair/abc' });

        expect(html).toContain('Não quero mais receber estes avisos');
        expect(html).toContain('https://app.vera.example/sair/abc');
    });

    it('drops the heading when it is explicitly empty, instead of falling back to the title', () => {
        expect(baseLayout({ ...BASE, heading: '' })).not.toContain('<h1');
    });

    it('treats null as no heading, unlike undefined, which inherits the title', () => {
        expect(baseLayout({ ...BASE, heading: null })).not.toContain('<h1');
        expect(baseLayout({ ...BASE })).toContain('<h1');
    });

    it('renders the footnote when there is one', () => {
        expect(baseLayout({ ...BASE, footnote: 'Aviso enviado uma vez por incidente' })).toContain('Aviso enviado uma vez por incidente');
    });

    it('renders the action button when there is a label and a link', () => {
        const html: string = baseLayout({ ...BASE, ctaLabel: 'Entrar', ctaUrl: 'https://app.vera.example/login' });

        expect(html).toContain('Entrar');
        expect(html).toContain('https://app.vera.example/login');
    });

    it('leaves the button out when either the label or the link is missing', () => {
        expect(baseLayout({ ...BASE, ctaLabel: 'Entrar' })).not.toContain('>Entrar</a>');
        expect(baseLayout({ ...BASE, ctaUrl: 'https://app.vera.example/login' })).not.toContain('app.vera.example/login');
    });
});
