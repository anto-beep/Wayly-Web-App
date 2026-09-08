// Lightweight ESLint flat config — focused on catching missing imports.
//
// Why this exists:
//   We shipped a chat bug where `<RotateCcw />` and `toast.*` were used
//   without being imported, causing a runtime `ReferenceError` that the
//   error boundary turned into a generic 500 page. CRA's internal lint
//   is warnings-only and doesn't block the build, so the missing import
//   slipped through.
//
// This config runs as a *separate* `yarn lint` step (not CRA's loader)
// and is wired into the git pre-commit hook to block commits that
// introduce undefined references. It deliberately ignores stylistic
// rules — the goal is to catch real, runtime-breaking bugs only.

import js from "@eslint/js";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  {
    ignores: [
      "build/**",
      "node_modules/**",
      "public/**",
      "src/components/ui/**", // shadcn-generated, owned by upstream
    ],
  },
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2024,
        // CRA / Jest globals
        process: "readonly",
        jest: "readonly",
        global: "readonly",
      },
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooks,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      // === The actual guard ===
      // Catches: <RotateCcw /> with no import, toast.success() with no
      // import, calling utilities that don't exist, etc.
      "no-undef": "error",
      // no-undef alone does NOT cover JSX element names (e.g. <RotateCcw />)
      // because they're parsed as JSX identifiers, not regular references.
      // jsx-no-undef closes that gap — this is the rule that catches the
      // original Chat.jsx bug.
      "react/jsx-no-undef": "error",

      // JSX usage counts as "using" a variable, so `import { Foo }` +
      // `<Foo />` doesn't flag Foo as unused, AND ensures `<Foo />`
      // proves Foo is referenced (so no-undef fires when missing).
      "react/jsx-uses-react": "error",
      "react/jsx-uses-vars": "error",

      // Safety nets that catch a few other crash-prone bugs cheaply.
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-unreachable": "error",
      "no-const-assign": "error",
      "no-redeclare": "error",
    },
  },
];
