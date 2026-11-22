import { builtinRules } from 'eslint/use-at-your-own-risk';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import { decorated } from './sonar-decorators.mjs';
import { SONAR_WAY_EXTERNAL, SONAR_WAY_MAIN, SONAR_WAY_TEST } from './sonar-way.mjs';

const SONAR_SOURCES = ['src/**/*.ts'];
const SONAR_TESTS = ['src/**/*.spec.ts', 'test/**/*.spec.ts', 'test/**/*.int-spec.ts'];

function externalRule(id) {
    if (id.startsWith('@typescript-eslint/')) {
        return tseslint.plugin.rules[id.slice('@typescript-eslint/'.length)];
    }
    if (id.startsWith('unicorn/')) {
        return unicorn.rules[id.slice('unicorn/'.length)];
    }
    return builtinRules.get(id);
}

function declaredOptions(rule, ruleOptions) {
    const schema = Array.isArray(rule.meta.schema) ? rule.meta.schema : [];
    return ruleOptions.map((option, index) => {
        const properties = schema[index]?.properties;
        if (properties === undefined || typeof option !== 'object' || Array.isArray(option)) {
            return option;
        }
        return Object.fromEntries(Object.entries(option).filter(([field]) => field in properties));
    });
}

const rules = {};
const options = {};
for (const rule of Object.values(sonarjs.rules)) {
    rules[rule.meta.docs.url.match(/S\d+/)[0]] = rule;
}
for (const [key, [id, ...ruleOptions]] of Object.entries(SONAR_WAY_EXTERNAL)) {
    const rule = externalRule(id);
    rules[key] = decorated(rule, key);
    options[key] = declaredOptions(rule, ruleOptions);
}

function activated(keys) {
    return Object.fromEntries(
        keys.filter((key) => rules[key] !== undefined).map((key) => [`sonar/${key}`, ['error', ...(options[key] ?? [])]])
    );
}

export const sonarPlugin = { rules };
export const SONAR_MAIN_RULES = activated(SONAR_WAY_MAIN);
export const SONAR_TEST_RULES = activated(SONAR_WAY_TEST);
export const SONAR_SOURCE_FILES = SONAR_SOURCES;
export const SONAR_TEST_FILES = SONAR_TESTS;
