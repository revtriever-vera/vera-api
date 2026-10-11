import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import prettier from 'eslint-config-prettier';
import local from './eslint-rules/index.mjs';

export default tseslint.config(
    {
        ignores: [
            '**/dist/**',
            'node_modules/**',
            'src/core/database/generated/**',
            'commitlint.config.mjs',
            'eslint.config.mjs',
            'eslint-rules/**',
            'vitest.config.mts',
            'vitest.integration.config.mts',
            'tsup.config.ts'
        ]
    },
    eslint.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname
            }
        },
        plugins: { local },
        rules: {
            eqeqeq: ['error', 'always'],
            'no-console': 'error',
            'local/no-comments': 'error',
            'local/no-else': 'error',
            'local/no-search-in-loop': 'error',
            'local/no-nested-loops': 'error',
            'local/max-logic-lines': ['error', { max: 20 }],
            'no-lonely-if': 'error',
            complexity: ['error', 10],
            'max-depth': ['error', 2],
            'max-params': ['error', 8],
            '@typescript-eslint/no-extraneous-class': 'off',
            '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'explicit' }],
            '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
            '@typescript-eslint/explicit-module-boundary-types': 'error',
            '@typescript-eslint/typedef': [
                'error',
                {
                    variableDeclaration: true,
                    variableDeclarationIgnoreFunction: true,
                    memberVariableDeclaration: true,
                    propertyDeclaration: true,
                    parameter: true
                }
            ],
            '@typescript-eslint/prefer-readonly': 'error',
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
            ],
            '@typescript-eslint/member-ordering': [
                'error',
                { default: ['static-field', 'instance-field', 'constructor', 'static-method', 'instance-method'] }
            ],
            '@typescript-eslint/no-import-type-side-effects': 'error',
            'no-restricted-syntax': [
                'error',
                {
                    selector: 'TSEnumDeclaration',
                    message: 'TS enums are forbidden — use `as const` objects or string unions (conventions skill).'
                },
                {
                    selector: 'ExportDefaultDeclaration',
                    message: 'Default exports are forbidden (conventions skill).'
                },
                {
                    selector: "Property[key.name='jobId'] TemplateElement[value.raw=/:/]",
                    message:
                        'jobId com ":" o BullMQ recusa ("Custom Id cannot contain :"), e só na hora de publicar — depois do efeito já feito. Use hífen.'
                },
                {
                    selector: "Property[key.name='jobId'] > Literal[value=/:/]",
                    message:
                        'jobId com ":" o BullMQ recusa ("Custom Id cannot contain :"), e só na hora de publicar — depois do efeito já feito. Use hífen.'
                }
            ],
            'no-restricted-properties': [
                'error',
                {
                    object: 'Scope',
                    property: 'REQUEST',
                    message: 'Scope.REQUEST is forbidden — use the AppContext AsyncLocalStorage (architecture skill).'
                }
            ]
        }
    },
    {
        files: ['src/**/*.ts'],
        plugins: { boundaries },
        settings: {
            'import/resolver': { typescript: { alwaysTryTypes: true } },
            'boundaries/include': ['src/**/*.ts'],
            'boundaries/elements': [
                { type: 'shared', pattern: 'src/shared' },
                { type: 'config', pattern: 'src/config' },
                { type: 'core', pattern: 'src/core/*', capture: ['coreModule'] },
                { type: 'module', pattern: 'src/modules/*', capture: ['feature'] }
            ],
            'boundaries/files': [{ pattern: 'src/*.ts', category: 'main' }]
        },
        rules: {
            'boundaries/dependencies': [
                'error',
                {
                    default: 'disallow',
                    message: 'Import crosses a forbidden boundary (architecture skill)',
                    policies: [
                        { from: { element: { type: 'shared' } }, allow: { to: { element: { type: 'shared' } } } },
                        { from: { element: { type: 'config' } }, allow: { to: { element: { type: 'shared' } } } },
                        { from: { element: { type: 'core' } }, allow: { to: { element: { type: 'core' } } } },
                        { from: { element: { type: 'core' } }, allow: { to: { element: { type: 'shared' } } } },
                        { from: { element: { type: 'module' } }, allow: { to: { element: { type: 'shared' } } } },
                        { from: { element: { type: 'module' } }, allow: { to: { element: { type: 'core' } } } },
                        {
                            from: { element: { type: 'module' } },
                            allow: {
                                to: {
                                    element: { type: 'module', captured: { feature: '{{ from.element.captured.feature }}' } }
                                }
                            }
                        },
                        {
                            from: { element: { type: 'module' } },
                            allow: { to: { element: { type: 'module', fileInternalPath: '**/*.module.ts' } } },
                            message: 'Other modules may only be imported via their module file or exported services (architecture skill)'
                        },
                        {
                            from: { element: { type: 'module' } },
                            allow: { to: { element: { type: 'module', fileInternalPath: 'services/**' } } },
                            message: 'Other modules may only be imported via their module file or exported services (architecture skill)'
                        },
                        { from: { file: { categories: 'main' } }, allow: { to: { file: { categories: 'main' } } } },
                        { from: { file: { categories: 'main' } }, allow: { to: { element: { type: 'shared' } } } },
                        { from: { file: { categories: 'main' } }, allow: { to: { element: { type: 'config' } } } },
                        { from: { file: { categories: 'main' } }, allow: { to: { element: { type: 'core' } } } },
                        { from: { file: { categories: 'main' } }, allow: { to: { element: { type: 'module' } } } }
                    ]
                }
            ]
        }
    },
    {
        files: ['src/**/*.ts'],
        ignores: ['src/**/domain/*.types.ts', 'src/core/database/**'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['**/core/database/generated/**'],
                            message:
                                'Tipos de tabela só entram pelo model do módulo (domain/<feature>.types.ts) — nunca importe o arquivo gerado direto (data-access skill).'
                        }
                    ]
                }
            ]
        }
    },
    {
        files: ['src/modules/*/access/**/*.ts'],
        ignores: ['src/modules/*/access/**/*.spec.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['**/*.domain', '**/*-domain.module', '**/*.repository', '**/*-repository.module'],
                            message:
                                'access só injeta application. A hierarquia é access → application → domain → repository; pular camada é bloqueador de review (architecture skill).'
                        },
                        {
                            group: ['**/*.service'],
                            allowTypeImports: true,
                            message:
                                'access só injeta application. services (*.service.ts) ficam em services/ para serem consumidos por application — passar service direto para o controller fura a fronteira (architecture skill).'
                        }
                    ]
                }
            ]
        }
    },
    {
        files: ['src/modules/*/application/**/*.ts'],
        ignores: ['src/modules/*/application/*.module.ts', 'src/modules/*/application/*.spec.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['**/*.repository', '**/*-repository.module'],
                            message:
                                'application nunca toca repositório — o acesso a dados passa pelo domain que é dono do agregado (architecture skill).'
                        },
                        {
                            group: ['./*.application', '../*/application/*.application', '**/modules/*/application/*.application'],
                            allowTypeImports: true,
                            message:
                                'application não injeta outra application — extraia o que as duas precisam para um domain ou um service (architecture skill).'
                        }
                    ]
                }
            ]
        }
    },
    {
        files: ['src/modules/*/domain/**/*.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['**/*.application', '**/*-application.module', '**/access/**'],
                            message: 'domain não conhece application nem access — a dependência aponta só para baixo (architecture skill).'
                        }
                    ]
                }
            ]
        }
    },
    {
        files: ['src/**/*.repository.ts'],
        rules: {
            'no-restricted-syntax': [
                'error',
                {
                    selector: 'TSEnumDeclaration',
                    message: 'TS enums are forbidden — use `as const` objects or string unions (conventions skill).'
                },
                {
                    selector: 'ExportDefaultDeclaration',
                    message: 'Default exports are forbidden (conventions skill).'
                },
                {
                    selector: "Property[key.name='jobId'] TemplateElement[value.raw=/:/]",
                    message:
                        'jobId com ":" o BullMQ recusa ("Custom Id cannot contain :"), e só na hora de publicar — depois do efeito já feito. Use hífen.'
                },
                {
                    selector: "Property[key.name='jobId'] > Literal[value=/:/]",
                    message:
                        'jobId com ":" o BullMQ recusa ("Custom Id cannot contain :"), e só na hora de publicar — depois do efeito já feito. Use hífen.'
                },
                {
                    selector: "CallExpression[callee.property.name='updateTable']",
                    message:
                        'update cru pula o filtro de empresa do TenantRepository — use updateRow/updateManyRows, que já aplicam scopeFilter (data-access skill).'
                },
                {
                    selector: "CallExpression[callee.property.name='deleteFrom']",
                    message: 'delete cru pula o filtro de empresa do TenantRepository — use softDeleteRow (data-access skill).'
                }
            ]
        }
    },
    {
        files: [
            'src/core/database/repositories/global.repository.ts'
        ],
        rules: {
            'no-restricted-syntax': [
                'error',
                {
                    selector: 'TSEnumDeclaration',
                    message: 'TS enums are forbidden — use `as const` objects or string unions (conventions skill).'
                },
                {
                    selector: 'ExportDefaultDeclaration',
                    message: 'Default exports are forbidden (conventions skill).'
                },
                {
                    selector: "Property[key.name='jobId'] TemplateElement[value.raw=/:/]",
                    message:
                        'jobId com ":" o BullMQ recusa ("Custom Id cannot contain :"), e só na hora de publicar — depois do efeito já feito. Use hífen.'
                },
                {
                    selector: "Property[key.name='jobId'] > Literal[value=/:/]",
                    message:
                        'jobId com ":" o BullMQ recusa ("Custom Id cannot contain :"), e só na hora de publicar — depois do efeito já feito. Use hífen.'
                }
            ]
        }
    },
    {
        files: ['src/modules/*/repositories/*.repository.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: [
                                './*.repository',
                                '../../*/repositories/*.repository',
                                '**/modules/*/repositories/*.repository',
                                '**/*.domain',
                                '**/*.application',
                                '**/access/**'
                            ],
                            message:
                                'repositório injeta só DatabaseClient e AppContext — nem outro repositório, nem domain, nem application (architecture skill).'
                        }
                    ]
                }
            ]
        }
    },
    {
        files: ['src/**/*.ts'],
        ignores: [
            'src/**/domain/**',
            'src/**/*.repository.ts',
            'src/**/*.module.ts',
            'src/modules/*/access/**',
            'src/modules/*/application/**'
        ],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['**/*.repository'],
                            message:
                                'Só domain injeta repositório. Vale para core também: se o dado precisa ser lido ou gravado aqui, passe por um <entidade>.domain (architecture skill).'
                        }
                    ]
                }
            ]
        }
    },
    {
        files: ['src/modules/*/services/**/*.ts'],
        ignores: ['src/modules/*/services/*.module.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['**/*.application', '**/*-application.module', '**/access/**'],
                            allowTypeImports: true,
                            message:
                                'service não injeta application nem access — a dependência aponta para baixo, e service é o que application usa (architecture skill).'
                        },
                        {
                            group: ['**/*.repository'],
                            message: 'Só domain injeta repositório (architecture skill).'
                        }
                    ]
                }
            ]
        }
    },
    {
        files: [
            'src/**/validation/**/*.ts',
            'src/**/config/*.ts',
            'src/config/*.ts',
            'src/shared/constants/**/*.ts',
            'src/**/*.schema.ts',
            'src/**/*.schemas.ts',
            'src/**/*.contracts.ts',
            'src/**/*.types.ts'
        ],
        rules: {
            '@typescript-eslint/typedef': [
                'error',
                {
                    variableDeclaration: false,
                    variableDeclarationIgnoreFunction: true,
                    memberVariableDeclaration: true,
                    propertyDeclaration: true,
                    parameter: true
                }
            ]
        }
    },
    {
        files: ['scripts/**/*.ts'],
        rules: {
            'no-console': 'off',
            'max-lines-per-function': 'off'
        }
    },
    {
        files: ['migrations/**/*.ts', 'kysely.config.ts'],
        rules: {
            '@typescript-eslint/typedef': 'off',
            '@typescript-eslint/explicit-function-return-type': 'off',
            'no-restricted-syntax': 'off',
            'max-lines-per-function': 'off'
        }
    },
    {
        files: ['**/*.spec.ts', '**/*.int-spec.ts', 'test/**/*.ts'],
        rules: {
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/typedef': 'off',
            '@typescript-eslint/explicit-function-return-type': 'off',
            'max-lines-per-function': 'off',
            'max-statements': 'off',
            'max-depth': 'off',
            complexity: 'off',
            'local/no-else': 'off',
            'local/no-search-in-loop': 'off'
        }
    },
    prettier
);
