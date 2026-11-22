function namesOf(sources, source) {
    return sources
        .filter((each) => each.source === source || (each.suffix !== undefined && source.endsWith(each.suffix)))
        .flatMap((each) => each.names);
}

export const skillSourceImport = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'As skills de produto saem do catálogo central. Quem importa a lista direto da fonte decide alcance por conta própria; só o diretório central e os arquivos nomeados nas opções, com o motivo, podem.'
        },
        schema: [
            {
                type: 'object',
                properties: {
                    sources: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                source: { type: 'string' },
                                suffix: { type: 'string' },
                                names: { type: 'array', items: { type: 'string' }, minItems: 1 }
                            },
                            required: ['names'],
                            additionalProperties: false
                        }
                    },
                    central: { type: 'string' },
                    allowed: { type: 'object', additionalProperties: { type: 'string' } }
                },
                additionalProperties: false
            }
        ],
        messages: {
            found: '{{name}} vem do catálogo de skills, não da fonte. Exceções nomeadas ficam nas opções da regra, com o motivo.'
        }
    },
    create(context) {
        const options = context.options[0] ?? {};
        const sources = options.sources ?? [];
        const central = options.central ?? '/core/prompt/';
        const allowed = options.allowed ?? {};
        const file = context.filename.replaceAll('\\', '/');
        if (sources.length === 0 || file.includes(central) || Object.keys(allowed).some((path) => file.endsWith(path))) {
            return {};
        }
        return {
            ImportDeclaration(node) {
                const names = namesOf(sources, String(node.source.value));
                if (names.length === 0) {
                    return;
                }
                for (const specifier of node.specifiers) {
                    const imported = specifier.type === 'ImportSpecifier' ? specifier.imported.name : null;
                    if (imported !== null && names.includes(imported)) {
                        context.report({ node: specifier, messageId: 'found', data: { name: imported } });
                    }
                }
            }
        };
    }
};
