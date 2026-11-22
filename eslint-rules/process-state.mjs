const COLLECTIONS = new Set(['Map', 'Set', 'WeakMap', 'WeakSet']);
const GLOBAL_OBJECTS = new Set(['globalThis', 'global']);
const WRITERS = {
    Object: new Set(['assign', 'defineProperty', 'defineProperties', 'setPrototypeOf']),
    Reflect: new Set(['set', 'deleteProperty', 'defineProperty', 'setPrototypeOf'])
};
const MODULE_MOCKS = new Set(['mock', 'doMock']);

function isIdentifier(node, name) {
    return node?.type === 'Identifier' && node.name === name;
}

function isProcessEnv(node) {
    return (
        node?.type === 'MemberExpression' && isIdentifier(node.object, 'process') && !node.computed && isIdentifier(node.property, 'env')
    );
}

function isPrototype(node) {
    return node?.type === 'MemberExpression' && !node.computed && isIdentifier(node.property, 'prototype');
}

function sharedTarget(node) {
    if (isProcessEnv(node)) return 'env';
    if (node?.type === 'Identifier' && GLOBAL_OBJECTS.has(node.name)) return 'global';
    if (isPrototype(node)) return 'prototype';
    if (node?.type !== 'MemberExpression') return null;
    if (isProcessEnv(node.object)) return 'env';
    if (node.object.type === 'Identifier' && GLOBAL_OBJECTS.has(node.object.name)) return 'global';
    if (isPrototype(node.object)) return 'prototype';
    return null;
}

function isMutableCollection(value) {
    return value?.type === 'NewExpression' && value.callee.type === 'Identifier' && COLLECTIONS.has(value.callee.name);
}

export const noStaticState = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Estado estático mutável de classe vaza de um arquivo de teste para o próximo no mesmo worker. Guarde o estado numa instância injetada.'
        },
        schema: [],
        messages: {
            mutable:
                'Campo estático que muda vaza de um arquivo de teste para o próximo no mesmo worker. Guarde o estado numa instância injetada ou declare o campo `static readonly` com valor imutável.',
            collection:
                'Coleção estática que muda vaza de um arquivo de teste para o próximo no mesmo worker. Guarde a coleção numa instância injetada.'
        }
    },
    create(context) {
        return {
            PropertyDefinition(node) {
                if (!node.static) return;
                if (!node.readonly) {
                    context.report({ node, messageId: 'mutable' });
                    return;
                }
                if (isMutableCollection(node.value)) context.report({ node, messageId: 'collection' });
            }
        };
    }
};

export const noSharedStateWrite = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Spec não escreve em process.env, em globalThis nem num prototype: o próximo arquivo do mesmo worker herda a escrita. Use vi.stubEnv, vi.stubGlobal e vi.spyOn, que o setup desfaz.'
        },
        schema: [],
        messages: {
            env: 'Escrita em process.env num spec. Use vi.stubEnv(nome, valor), ou vi.stubEnv(nome, undefined) para tirar a variável.',
            global: 'Escrita em globalThis num spec. Use vi.stubGlobal(nome, valor).',
            prototype: 'Escrita num prototype num spec. Use vi.spyOn(Classe.prototype, "metodo").'
        }
    },
    create(context) {
        function check(node, target) {
            const kind = sharedTarget(target);
            if (kind) context.report({ node, messageId: kind });
        }
        return {
            AssignmentExpression(node) {
                check(node, node.left);
            },
            UpdateExpression(node) {
                check(node, node.argument);
            },
            UnaryExpression(node) {
                if (node.operator === 'delete') check(node, node.argument);
            },
            CallExpression(node) {
                const callee = node.callee;
                if (callee.type !== 'MemberExpression' || callee.computed || callee.object.type !== 'Identifier') return;
                if (!Object.hasOwn(WRITERS, callee.object.name) || !WRITERS[callee.object.name].has(callee.property.name)) return;
                check(node, node.arguments[0]);
            }
        };
    }
};

export const moduleMockInSpec = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'vi.mock e vi.doMock só num arquivo *.spec.ts: num helper compartilhado, o mock vale para todo spec que o importa e some da leitura de quem escreve o spec.'
        },
        schema: [],
        messages: {
            found: 'vi.{{name}} fora de um *.spec.ts. O spec que precisa do mock chama vi.{{name}} no próprio arquivo.'
        }
    },
    create(context) {
        return {
            CallExpression(node) {
                const callee = node.callee;
                if (callee.type !== 'MemberExpression' || callee.computed || !isIdentifier(callee.object, 'vi')) return;
                if (!MODULE_MOCKS.has(callee.property.name)) return;
                context.report({ node, messageId: 'found', data: { name: callee.property.name } });
            }
        };
    }
};
