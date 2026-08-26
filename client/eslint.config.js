/**
 * Lint configuration for C-18.
 *
 * The constitution's gates are enforced elsewhere, by the Python gates in `scripts/`,
 * which read TypeScript as well as Python. This configuration is the ordinary quality
 * bar underneath them: unused code, unsafe types, and the react-in-scope rules.
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist", "src/generated"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message:
            "reach the network through the transport and configuration modules, which name no location",
        },
      ],
    },
  },
);
