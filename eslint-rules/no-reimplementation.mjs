import { relative, sep } from 'node:path';

const COMPUTED_VALUES = new Set(['BinaryExpression', 'LogicalExpression', 'UnaryExpression', 'ConditionalExpression']);
const WRAPPERS = new Set(['ChainExpression', 'TSNonNullExpression', 'TSAsExpression']);

function unwrapped(node) {
    let current = node;
    while (current && WRAPPERS.has(current.type)) {
        current = current.expression;
    }
    if (current?.type === 'CallExpression' && current.callee.type === 'MemberExpression' && current.arguments.length === 0) {
        return unwrapped(current.callee.object);
    }
    return current;
}

function elementKey(element) {
    const node = unwrapped(element);
    if (node?.type === 'Literal') {
        return node.value;
    }
    if (node?.type === 'MemberExpression' && !node.computed) {
        return node.property.name;
    }
    return undefined;
}

function arrayHasAll(node, includes) {
    const keys = new Set(node.elements.map(elementKey));
    return includes.every((value) => keys.has(value));
}

function nameOf(node) {
    if (node.type === 'Identifier') {
        return node.name;
    }
    if (node.type === 'Literal') {
        return String(node.value);
    }
    return undefined;
}

function computedName(names, key, value) {
    return key !== undefined && names.includes(key) && value !== null && value !== undefined && COMPUTED_VALUES.has(value.type);
}

function visitorsOf(pattern, report) {
    if (pattern.kind === 'array') {
        return {
            ArrayExpression(node) {
                if (arrayHasAll(node, pattern.includes)) {
                    report(node);
                }
            }
        };
    }
    if (pattern.kind === 'text') {
        const expression = new RegExp(pattern.match, 'i');
        return {
            TemplateElement(node) {
                if (expression.test(node.value.raw)) {
                    report(node);
                }
            },
            Literal(node) {
                if (typeof node.value === 'string' && expression.test(node.value)) {
                    report(node);
                }
            }
        };
    }
    return {
        Property(node) {
            if (computedName(pattern.names, nameOf(node.key), node.value)) {
                report(node);
            }
        },
        VariableDeclarator(node) {
            if (computedName(pattern.names, nameOf(node.id), node.init)) {
                report(node);
            }
        }
    };
}

function merged(visitorSets) {
    const byNode = new Map();
    for (const visitors of visitorSets) {
        Object.entries(visitors).forEach(([type, visit]) => {
            byNode.set(type, [...(byNode.get(type) ?? []), visit]);
        });
    }
    return Object.fromEntries(
        [...byNode.entries()].map(([type, visits]) => [
            type,
            (node) => {
                visits.forEach((visit) => visit(node));
            }
        ])
    );
}

function relativePath(context) {
    return relative(context.cwd, context.filename).split(sep).join('/');
}

function applies(source, pattern, path) {
    if (path === source.owner || (source.frozen ?? []).includes(path)) {
        return false;
    }
    return pattern.files === undefined || new RegExp(pattern.files).test(path);
}

const patternSchema = {
    type: 'object',
    properties: {
        what: { type: 'string' },
        kind: { enum: ['array', 'text', 'computed'] },
        includes: { type: 'array', items: { type: ['number', 'string'] }, minItems: 1 },
        match: { type: 'string' },
        names: { type: 'array', items: { type: 'string' }, minItems: 1 },
        files: { type: 'string' }
    },
    required: ['what', 'kind'],
    additionalProperties: false
};

const sourceSchema = {
    type: 'object',
    properties: {
        rule: { type: 'string' },
        owner: { type: 'string' },
        exports: { type: 'array', items: { type: 'string' }, minItems: 1 },
        patterns: { type: 'array', items: patternSchema, minItems: 1 },
        frozen: { type: 'array', items: { type: 'string' } }
    },
    required: ['rule', 'owner', 'exports', 'patterns'],
    additionalProperties: false
};

export const noReimplementation = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Regra de domínio com fonte única não é recriada fora do dono. Cada fonte única lista os padrões que denunciam uma cópia; a lista cresce a cada duplicação achada em revisão.'
        },
        schema: [
            {
                type: 'object',
                properties: { sources: { type: 'array', items: sourceSchema } },
                required: ['sources'],
                additionalProperties: false
            }
        ],
        messages: {
            found: 'Isso já existe em {{owner}} ({{exports}}): {{what}}. Importe a fonte única em vez de recriar a regra ({{rule}}).'
        }
    },
    create(context) {
        const path = relativePath(context);
        const sources = context.options[0]?.sources ?? [];
        const visitorSets = sources.flatMap((source) =>
            source.patterns
                .filter((pattern) => applies(source, pattern, path))
                .map((pattern) =>
                    visitorsOf(pattern, (node) => {
                        context.report({
                            node,
                            messageId: 'found',
                            data: { owner: source.owner, exports: source.exports.join(', '), what: pattern.what, rule: source.rule }
                        });
                    })
                )
        );
        return merged(visitorSets);
    }
};
