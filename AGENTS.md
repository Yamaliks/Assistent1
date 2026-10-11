# Assistent1 development rules

- Stack: Tauri 2, React, strict TypeScript, Tailwind CSS, Rust, Lucide.
- Read ROADMAP.md; implement only the stage explicitly requested by the user.
- Keep UI Russian and use Graphite Purple tokens from src/styles.css.
- Never claim unfinished voice or system functions work. Label drafts and unavailable actions clearly.
- No cloud APIs, arbitrary shell execution, or program closure without explicit confirmation.
- Route typed commands through Command Router → Mode Engine → System Services. Keep Voice Service and Settings Storage separate.
- Reuse the two configured Tauri windows; do not create duplicate palettes.
- Validate stored data; never silently overwrite unreadable settings or assume software is installed.
- Run `npm test` and `npm run build`; run Rust checks when the toolchain/platform supports them. Report unrun checks.
- Use the existing isolated checkout. Do not create Git worktrees unless explicitly requested.
- Keep dependencies minimal and commit lockfiles. Do not commit credentials, generated bundles or caches.
