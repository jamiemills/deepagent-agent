import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: ["node_modules/**", ".data/**", "coverage/**"],
  },
  {
    files: ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      complexity: ["error", 10],
    },
  },
];
