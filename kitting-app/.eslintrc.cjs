module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  plugins: ["@typescript-eslint", "react-hooks", "react-refresh"],
  ignorePatterns: ["dist", "dev-dist", "node_modules", ".eslintrc.cjs", "vite.config.ts"],
  rules: {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "no-empty": ["error", { allowEmptyCatch: true }],
  },
  overrides: [
    {
      files: ["test/**/*.ts", "test/**/*.tsx"],
      rules: {
        // Tests destructure `let { state, kitId } = ...` where only `state` is reassigned.
        "prefer-const": "off",
      },
    },
  ],
};
