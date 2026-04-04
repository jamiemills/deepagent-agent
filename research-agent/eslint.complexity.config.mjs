import tsParser from "@typescript-eslint/parser";
import sonarjs from "eslint-plugin-sonarjs";

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
    plugins: {
      sonarjs,
    },
    rules: {
      complexity: ["error", 10],
      "sonarjs/max-lines": ["warn", { maximum: 100000 }],
    },
  },
];
