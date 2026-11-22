import { RegExpParser } from '@eslint-community/regexpp';

// SonarJS does not run some wrapped rules as they are: it drops part of their reports (a "decorator", in
// packages/analysis/src/jsts/rules/<key>/decorator.ts). These are ports of the decorators of the rules that otherwise
// report a lot that Sonar does not, so the check stays as quiet as the quality gate.

function intercept(rule, keep) {
    return {
        ...rule,
        create(context) {
            const filtered = Object.create(context, {
                report: {
                    value(descriptor) {
                        if (keep(context, descriptor)) {
                            context.report(descriptor);
                        }
                    }
                }
            });
            return rule.create(filtered);
        }
    };
}

function maxOf(context) {
    const [option] = context.options;
    if (typeof option === 'number') {
        return option;
    }
    return option?.max ?? 7;
}

function countsOverMax(context, descriptor) {
    const params = descriptor.node?.params ?? [];
    return params.filter((param) => param.type !== 'TSParameterProperty').length > maxOf(context);
}

function isArrayLike(checker, type) {
    const constrained = checker.getBaseConstraintOfType(type) ?? type;
    const parts = constrained.isUnion() ? constrained.types : [constrained];
    return parts.every((part) => checker.isArrayType(part));
}

function callsOnArrayWithWideCallback(context, descriptor) {
    const services = context.sourceCode.parserServices;
    const node = descriptor.node;
    if (node === undefined || services?.program === undefined) {
        return false;
    }
    const call = node.parent;
    if (call?.type !== 'CallExpression' || call.callee.type !== 'MemberExpression') {
        return false;
    }
    const checker = services.program.getTypeChecker();
    const typeOf = (esNode) => checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(esNode));
    if (!isArrayLike(checker, typeOf(call.callee.object))) {
        return false;
    }
    if (node.type !== 'Identifier' && node.type !== 'MemberExpression') {
        return true;
    }
    const signatures = typeOf(node).getCallSignatures();
    return signatures.length === 0 || Math.max(...signatures.map((signature) => signature.parameters.length)) > 1;
}

function importKindOf(sourceCode, name) {
    for (const node of sourceCode.ast.body) {
        if (node.type !== 'ImportDeclaration') {
            continue;
        }
        const specifier = node.specifiers.find((candidate) => candidate.local.name === name);
        if (specifier === undefined) {
            continue;
        }
        const imported = specifier.type === 'ImportSpecifier' ? (specifier.imported.name ?? String(specifier.imported.value)) : null;
        return specifier.type === 'ImportDefaultSpecifier' || imported === 'default' ? 'default' : 'named';
    }
    return null;
}

function usedBesidesExport(sourceCode, name) {
    return sourceCode.ast.body
        .filter((node) => node.type === 'ImportDeclaration')
        .flatMap((node) => sourceCode.getDeclaredVariables(node))
        .filter((variable) => variable.name === name)
        .some((variable) =>
            variable.references.some(
                (reference) => !['ExportSpecifier', 'ExportDefaultDeclaration'].includes(reference.identifier.parent.type)
            )
        );
}

function reportedNameOf(node) {
    if (node.type === 'ExportSpecifier') {
        return node.local.type === 'Identifier' ? node.local.name : String(node.local.value);
    }
    if (node.type === 'Identifier') {
        return node.name;
    }
    return node.type === 'ExportDefaultDeclaration' && node.declaration.type === 'Identifier' ? node.declaration.name : undefined;
}

function reExportsAnImport(context, descriptor) {
    const node = descriptor.node;
    const sourceCode = context.sourceCode;
    if (node === undefined) {
        return true;
    }
    if (node.type === 'ExportNamedDeclaration' && node.declaration != null) {
        return (
            node.declaration.type === 'VariableDeclaration' &&
            node.declaration.declarations.some(
                (declarator) => declarator.init?.type === 'Identifier' && importKindOf(sourceCode, declarator.init.name) === 'named'
            )
        );
    }
    const name = reportedNameOf(node);
    if (name === undefined) {
        return true;
    }
    const kind = importKindOf(sourceCode, name);
    return kind === 'named' && !usedBesidesExport(sourceCode, name);
}

function literalOf(element) {
    if (element.type === 'Character') {
        return String.fromCodePoint(element.value);
    }
    if (element.type === 'CharacterClass') {
        const [only] = element.elements;
        return !element.negate && element.elements.length === 1 && only.type === 'Character' ? String.fromCodePoint(only.value) : null;
    }
    if (element.type === 'Group' && element.alternatives.length === 1) {
        return literalOfAlternative(element.alternatives[0]);
    }
    if (element.type === 'Quantifier' && element.min === element.max) {
        const fragment = literalOf(element.element);
        return fragment === null ? null : fragment.repeat(element.min);
    }
    return null;
}

function literalOfAlternative(alternative) {
    let literal = '';
    for (const element of alternative.elements) {
        const fragment = literalOf(element);
        if (fragment === null) {
            return null;
        }
        literal += fragment;
    }
    return literal;
}

function replacesAPlainString(_context, descriptor) {
    const node = descriptor.node;
    if (descriptor.messageId !== 'method' || node?.type !== 'Identifier' || node.name !== 'replace') {
        return true;
    }
    const pattern = node.parent?.parent?.arguments?.[0];
    if (pattern?.type !== 'Literal' || pattern.regex === undefined) {
        return false;
    }
    const { flags } = pattern.regex;
    if (!flags.includes('g') || /[dimsy]/.test(flags)) {
        return false;
    }
    try {
        const parsed = new RegExpParser().parsePattern(pattern.regex.pattern, undefined, undefined, { unicode: flags.includes('u') });
        const literal = parsed.alternatives.length === 1 ? literalOfAlternative(parsed.alternatives[0]) : null;
        return literal !== null && literal.length > 0;
    } catch {
        return false;
    }
}

export const SONAR_DECORATORS = {
    S107: countsOverMax,
    S7727: callsOnArrayWithWideCallback,
    S7763: reExportsAnImport,
    S7781: replacesAPlainString
};

export function decorated(rule, key) {
    const keep = SONAR_DECORATORS[key];
    return keep === undefined ? rule : intercept(rule, keep);
}
