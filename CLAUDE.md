# Lunar Landing Site Navigator: hackathon repo

This repo is run by the **`tech-arena-hackathon` skill** (`.claude/skills/tech-arena-hackathon/SKILL.md`). Load it before doing any work here: it says who does what, the timeline, and the rules. It works the same locally and in Claude Code on the web.

- **Build window:** Sat 14 Nov 2026 00:00 → Sun 15 Nov 2026 23:59 **AEDT (UTC+11)**. Cloud sessions run on UTC: check time with `TZ=Australia/Sydney date`.
- **Before kickoff:** no project code. Only `prep/`, `.claude/`, `CLAUDE.md` and `.gitignore` may change (the guard hook enforces this).
- **Where things are:** live status `prep/STATUS.md` · plan `prep/plan.md` · backlog `prep/backlog.md` · decisions `prep/decisions.md` · research `prep/research.md` · binding rules `.claude/skills/tech-arena-hackathon/reference/rules.md`.
- **Branches:** `main` (Vercel preview) · `ta/S<n>-<slug>` (slices) · `production` (live demo URL; only the Director moves it).
- **Never:** push or merge to `production`, force-push, change repo visibility, deploy to production, commit secrets or personal data, use NASA logos, or edit `.claude/settings.json` / `.claude/hooks/`.
- **Gate:** `npm run check` (typecheck + tests + build) must pass before anything merges to `main`.
