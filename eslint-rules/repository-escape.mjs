const UNSCOPED = /^unscoped[A-Z]/;

function calleeName(callee) {
    if (callee.type === 'Identifier') return callee.name;
    if (callee.type === 'MemberExpression' && !callee.computed) return callee.property.name;
    return '';
}

function isThisMember(node, name) {
    return node.object.type === 'ThisExpression' && !node.computed && node.property.name === name;
}

function isExecutor(node) {
    return !node.computed && node.property.type === 'Identifier' && node.property.name === 'executor';
}

export const repositoryEscape = {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Repository concreto lê e escreve pelo base: this.db, this.database, executor, sql e unscoped* escapam do escopo do tenant.'
        },
        schema: [],
        messages: {
            db: 'this.db fora do base não aplica companyId nem deletedAt. Use os métodos do base (findMany, updateRow, upsertRow, ...) ou monte a query com applyWhere(..., this.scoped(...)) (data-access skill).',
            database: 'this.database fora do base abre o executor sem escopo. Use os métodos do base (data-access skill).',
            executor:
                '.executor fora do base não aplica companyId nem deletedAt. Use os métodos do base (findMany, updateRow, upsertRow, ...) ou monte a query com applyWhere(..., this.scoped(...)) (data-access skill).',
            sql: "sql importado de 'kysely' num repository: SQL cru pula o filtro de empresa. Use os métodos do base e, onde o builder não alcança, declare o escape com eslint-disable e o motivo (data-access skill).",
            unscoped: 'Variante sem tenant (unscoped*). Exige eslint-disable com o motivo na mesma linha (data-access skill).'
        }
    },
    create(context) {
        return {
            MemberExpression(node) {
                if (isThisMember(node, 'db')) context.report({ node, messageId: 'db' });
                else if (isThisMember(node, 'database') && !(node.parent.type === 'MemberExpression' && isExecutor(node.parent))) {
                    context.report({ node, messageId: 'database' });
                } else if (isExecutor(node)) context.report({ node, messageId: 'executor' });
            },
            ImportDeclaration(node) {
                if (node.source.value !== 'kysely') return;
                for (const specifier of node.specifiers) {
                    if (specifier.type === 'ImportSpecifier' && specifier.imported.name === 'sql') {
                        context.report({ node: specifier, messageId: 'sql' });
                    }
                }
            },
            CallExpression(node) {
                if (UNSCOPED.test(calleeName(node.callee))) context.report({ node, messageId: 'unscoped' });
            }
        };
    }
};

export const clientEscape = {
    meta: {
        type: 'problem',
        docs: { description: 'Fora de repository, o DatabaseClient serve a transação: o executor devolve o Kysely sem escopo.' },
        schema: [],
        messages: {
            executor:
                'DatabaseClient fora de repository só serve a transação (withTransaction, afterCommit, beforeCommit). O executor lê e escreve sem escopo de tenant; leve a query para um repository (data-access skill).'
        }
    },
    create(context) {
        return {
            MemberExpression(node) {
                if (isExecutor(node)) context.report({ node, messageId: 'executor' });
            }
        };
    }
};
