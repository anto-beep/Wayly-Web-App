# Frontend lint guard

A lightweight ESLint check runs on every `git commit` to catch missing-import
bugs before they ship. The original motivating bug was the `RotateCcw is not
defined` ReferenceError on `/app/chat` that took the chat page down for users.

## What it checks

Only the rules that catch **runtime-breaking** bugs — no stylistic noise:

- `no-undef` — using a symbol that was never imported / declared.
- `react/jsx-no-undef` — using `<Foo />` when `Foo` was never imported.
- `no-dupe-keys`, `no-dupe-args`, `no-redeclare`, `no-const-assign`,
  `no-unreachable` — small set of cheap correctness checks.

Config: `frontend/eslint.config.mjs`.

## How it runs

| Trigger | Scope | Command |
|---|---|---|
| **`git commit`** | Only staged `frontend/src/**/*.{js,jsx}` files (excluding generated shadcn under `src/components/ui/`) | `.git/hooks/pre-commit` |
| **Manual sweep** | Whole frontend | `cd frontend && yarn lint` |
| **Manual auto-fix** | Whole frontend | `cd frontend && yarn lint --fix` |

The pre-commit version only lints staged files, so it stays sub-second even on
large changesets.

## Bypass (emergencies only)

```bash
git commit --no-verify -m "hotfix: …"
```

If you bypass, please open a follow-up to clean up the warning afterwards.
