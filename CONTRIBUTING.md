# Contributing to FrontlineAI

Thanks for taking the time to contribute. Whether it's a bug report, a documentation fix, or a new feature — it's appreciated.

## Quick start

```bash
git clone https://github.com/bardahan/FrontlineAI.git
cd FrontlineAI
./setup.sh   # interactive: prompts for tokens, writes .env files, installs deps
./dev.sh     # starts backend + frontend
```

You'll need accounts for the services listed in [Prerequisites](README.md#prerequisites). For development without real Twilio calls, you can still exercise most of the dashboard and API.

## Workflow

Direct pushes to `main` are blocked — every change goes through a pull request.

1. **Fork** this repo and clone your fork.
2. **Create a branch** off `main`:
   ```bash
   git checkout -b feat/short-description
   # or fix/, docs/, refactor/, chore/
   ```
3. **Make your change.** Keep commits focused. If your branch grows several unrelated commits, consider splitting it into separate PRs.
4. **Run it.** Verify backend boots (`cd backend && uvicorn main:app --reload`) and frontend builds (`cd frontend && npm run build`).
5. **Open a PR** against `main`. Fill out the template — what changed, why, how you tested it.
6. **CI + review.** Address feedback via additional commits (don't force-push during review). Squash on merge keeps history linear.

## Coding style

- **Python (backend)**: standard PEP 8. Type hints encouraged on new code.
- **JavaScript (frontend)**: match the surrounding code. Functional React components, hooks for state.
- **Commits**: imperative mood, short summary line ("Add X", "Fix Y", not "Added X"). Body explains *why*, not *what*.
- **No commented-out code, no dead branches, no TODOs without a tracking issue.**

## What makes a good PR

- Solves one problem.
- Doesn't expand scope mid-review.
- Has a clear test path in the description (manual steps if no automated tests yet).
- Doesn't touch unrelated files for "drive-by cleanup" — open a separate PR for that.

## Reporting bugs

Open an issue with:
- What you tried (steps to reproduce)
- What you expected to happen
- What actually happened (logs, screenshots if relevant)
- Your environment (OS, Python version, Node version)

## Suggesting features

Before writing the code, open an issue to discuss the idea. Saves you time if the maintainer has a different direction in mind.

## Security

If you find a security issue, **don't open a public issue.** Email the maintainer or use GitHub's private vulnerability reporting.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE) that covers this project.
