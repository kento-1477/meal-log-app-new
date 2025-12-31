module.exports = {
  root: false,
  env: {
    browser: true,
    es2023: true,
    node: true
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  },
  plugins: ["@typescript-eslint", "react", "react-hooks", "import"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:import/recommended",
    "plugin:import/typescript",
    "prettier"
  ],
  settings: {
    react: {
      version: "19.0"
    },
    "import/resolver": {
      typescript: {
        project: [
          "tsconfig.json",
          "apps/*/tsconfig.json",
          "packages/*/tsconfig.json"
        ],
        alwaysTryTypes: true
      },
      node: {
        extensions: [".js", ".jsx", ".ts", ".tsx"]
      }
    },
    "import/ignore": ["react-native"]
  },
  rules: {
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        ignoreRestSiblings: true,
        caughtErrors: "all",
        caughtErrorsIgnorePattern: "^_"
      }
    ],
    "@typescript-eslint/no-require-imports": "off"
  },
  overrides: [
    {
      files: ["supabase/functions/**/*.ts"],
      rules: {
        "import/no-unresolved": "off"
      }
    }
  ]
};
