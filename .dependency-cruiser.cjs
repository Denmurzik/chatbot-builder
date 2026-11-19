/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'Запрет циклических зависимостей между модулями',
      severity: 'error',
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: 'packages-no-apps',
      comment: 'Пакеты packages/* не могут зависеть от приложений apps/*',
      severity: 'error',
      from: {
        path: '^packages/',
      },
      to: {
        path: '^apps/',
      },
    },
    {
      name: 'model-no-project-packages',
      comment: '@chatbot/model не зависит ни от одного пакета или приложения проекта',
      severity: 'error',
      from: {
        path: '^packages/model/',
      },
      to: {
        path: '^(packages/(?!model/)|apps/)',
      },
    },
    {
      name: 'engine-core-only-model',
      comment: '@chatbot/engine-core из пакетов проекта зависит только от @chatbot/model',
      severity: 'error',
      from: {
        path: '^packages/engine-core/',
      },
      to: {
        path: '^(packages/(?!(engine-core|model)/)|apps/)',
      },
    },
    {
      name: 'web-allowed-packages',
      comment: 'apps/web из пакетов проекта импортирует только @chatbot/model и @chatbot/engine-core',
      severity: 'error',
      from: {
        path: '^apps/web/',
      },
      to: {
        path: '^packages/(?!(model|engine-core)/)',
      },
    },
    {
      name: 'no-cross-app-imports',
      comment: 'Запрет импортов между приложениями apps/*',
      severity: 'error',
      from: {
        path: '^apps/([^/]+)/',
      },
      to: {
        path: '^apps/',
        pathNot: '^apps/$1/',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: '(^|/)node_modules/|(^|/)dist/',
    },
    exclude: {
      path: '(^|/)coverage/|\\.(test|int\\.test)\\.(ts|tsx)$|(^|/)(test|testing|scripts|examples)/',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.base.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      mainFields: ['main', 'types', 'typings'],
    },
    reporterOptions: {
      dot: {
        collapsePattern: '^(packages/[^/]+|apps/[^/]+/src/[^/]+)',
      },
      archi: {
        collapsePattern: '^(packages/[^/]+|apps/[^/]+/src/[^/]+)',
        filters: {
          includeOnly: {
            path: '^(packages|apps)/',
          },
        },
      },
    },
  },
};
