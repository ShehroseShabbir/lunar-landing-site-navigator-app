#!/usr/bin/env python3
"""PreToolUse guard for the Lunar Landing Site Navigator hackathon repo.

Works the same on the Director's Mac and in Claude Code on the web (cloud
sessions run on UTC, so every time here is absolute UTC, never local time).

Rules (tech-arena-hackathon SKILL.md, DR-HACK-2):
  Before kickoff (Sat 14 Nov 2026 00:00 AEDT = Fri 13 Nov 13:00 UTC):
    * Write/Edit inside the repo only to prep/, .claude/, CLAUDE.md, .gitignore.
    * No package-manager scaffolding or installs (npm/pnpm/yarn/bun create|init|install|add|ci, npx create-*).
  Always:
    * No push or merge to the `production` branch (that branch is the live demo URL; the Director promotes).
    * No force push, no `git push --all/--mirror`.
    * No repo visibility change, public repo creation or repo deletion (Director only).
    * No `vercel --prod`, `vercel promote`, `vercel rollback` (Director only).
  After the deadline (Sun 15 Nov 2026 23:59 AEDT = 12:59 UTC):
    * Any push asks the Director first.

Set HACKATHON_GUARD_NOW=2026-11-14T02:00:00Z to test a moment in time.
"""
import json
import os
import re
import shlex
import subprocess
import sys
from datetime import datetime, timezone

KICKOFF_UTC = datetime(2026, 11, 13, 13, 0, 0, tzinfo=timezone.utc)
DEADLINE_UTC = datetime(2026, 11, 15, 12, 59, 59, tzinfo=timezone.utc)
PROD_BRANCH = "production"
PRE_KICKOFF_WRITABLE = ("prep/", ".claude/", "CLAUDE.md", ".gitignore")


def out(decision, reason):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse", "permissionDecision": decision,
        "permissionDecisionReason": reason}}))
    sys.exit(0)


def deny(reason):
    out("deny", reason)


def ask(reason):
    out("ask", reason)


def now():
    forced = os.environ.get("HACKATHON_GUARD_NOW")
    if forced:
        return datetime.fromisoformat(forced.replace("Z", "+00:00"))
    return datetime.now(timezone.utc)


def segments(cmd):
    return [s for s in re.split(r"&&|\|\||;|\||\n", cmd) if s.strip()]


def tokens(seg):
    try:
        return shlex.split(seg)
    except ValueError:
        return seg.split()


def current_branch(cwd):
    try:
        r = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=cwd or None,
                           capture_output=True, text=True, timeout=10)
        return r.stdout.strip() if r.returncode == 0 else None
    except Exception:
        return None


def check_write(path, project_dir):
    if not path:
        return
    full = os.path.realpath(os.path.join(project_dir, path) if not os.path.isabs(path) else path)
    root = os.path.realpath(project_dir)
    if not (full == root or full.startswith(root + os.sep)):
        return  # outside the repo (scratchpad, memory): not project code
    rel = os.path.relpath(full, root)
    if rel.startswith(PRE_KICKOFF_WRITABLE) or rel in PRE_KICKOFF_WRITABLE:
        return
    deny(f"Blocked by the hackathon date rule: no project code before kickoff "
         f"(Sat 14 Nov 2026 00:00 AEDT). Before then only prep/, .claude/, CLAUDE.md and "
         f".gitignore may change. Tried to write: {rel}")


def check_push(toks, start, cwd, after_deadline):
    rest = toks[start:]
    if after_deadline:
        ask("The hackathon deadline (Sun 15 Nov 23:59 AEDT) has passed. Pushing now may change the "
            "submitted code. Only allow this if the event rules permit it.")
    for t in rest:
        if t in ("--all", "--mirror"):
            deny("Blocked: `git push --all/--mirror` could update the production branch.")
        if t in ("-f", "--force", "--force-with-lease") or t.startswith("--force"):
            deny("Blocked: force pushes are not allowed in the hackathon repo.")
    args = [t for t in rest if not t.startswith("-")]
    if len(args) <= 1 or any(a in ("HEAD", "@") for a in args[1:]):
        if current_branch(cwd) == PROD_BRANCH:
            deny(f"Blocked: you are on '{PROD_BRANCH}' (the live demo). The Director promotes "
                 f"main to production through a GitHub PR.")
    for a in args[1:]:
        if a.startswith("+"):
            deny("Blocked: `+ref` force pushes are not allowed.")
        ref = a.split(":")[-1].removeprefix("refs/heads/")
        if ref == PROD_BRANCH:
            deny(f"Blocked: pushing to '{PROD_BRANCH}' (the live demo) is the Director's. "
                 f"Push main and ask the Director to promote.")


def check_pr_merge(toks, start, cwd):
    target = next((t for t in toks[start:] if not t.startswith("-")), None)
    try:
        r = subprocess.run(["gh", "pr", "view"] + ([target] if target else []) + ["--json", "baseRefName"],
                           cwd=cwd or None, capture_output=True, text=True, timeout=20)
        base = json.loads(r.stdout)["baseRefName"] if r.returncode == 0 else None
    except Exception:
        base = None
    if base == PROD_BRANCH:
        deny(f"Blocked: merging into '{PROD_BRANCH}' (the live demo) is the Director's.")
    if base is None:
        ask("The guard couldn't confirm this PR's base branch. Allow only if it is NOT 'production'.")


def check_bash(cmd, cwd, pre_kickoff, after_deadline):
    for seg in segments(cmd):
        toks = tokens(seg)
        names = [t.rsplit("/", 1)[-1] for t in toks]
        joined = " ".join(toks)
        for i, n in enumerate(names):
            nxt = names[i + 1:i + 3]
            if n == "git" and nxt[:1] == ["push"]:
                check_push(toks, i + 2, cwd, after_deadline)
            if n in ("gh", "ta-gh") and nxt == ["pr", "merge"]:
                check_pr_merge(toks, i + 3, cwd)
            if n in ("gh", "ta-gh") and nxt == ["repo", "edit"] and any(t.startswith("--visibility") for t in toks):
                deny("Blocked: changing repo visibility is the Director's (Tier 3).")
            if n in ("gh", "ta-gh") and nxt == ["repo", "create"] and "--public" in toks:
                deny("Blocked: the repo is created private; the Director makes it public at freeze.")
            if n in ("gh", "ta-gh") and nxt == ["repo", "delete"]:
                deny("Blocked: deleting a repo is the Director's.")
            if n == "vercel" and ("--prod" in toks or "production" in toks or (nxt[:1] and nxt[0] in ("promote", "rollback"))):
                deny("Blocked: production deploys are the Director's. Main gets preview deploys; "
                     "the Director promotes.")
            if pre_kickoff and n in ("npm", "pnpm", "yarn", "bun") and nxt[:1] and nxt[0] in (
                    "create", "init", "install", "i", "add", "ci"):
                deny("Blocked by the hackathon date rule: no scaffolding or installs before kickoff "
                     "(Sat 14 Nov 2026 00:00 AEDT).")
            if pre_kickoff and n in ("npx", "pnpx", "bunx") and any(t.startswith("create-") for t in names[i + 1:]):
                deny("Blocked by the hackathon date rule: no scaffolding before kickoff.")
        if re.search(r"\bgh api\b", joined) and re.search(r"visibility|\"?private\"?\s*[:=]", joined):
            deny("Blocked: changing repo visibility through `gh api` is the Director's.")


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        deny("Blocked: the hackathon guard couldn't read this tool call, so it fails closed.")
    t = now()
    pre_kickoff = t < KICKOFF_UTC
    after_deadline = t > DEADLINE_UTC
    tool = data.get("tool_name") or ""
    ti = data.get("tool_input") or {}
    cwd = data.get("cwd") or os.getcwd()
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR") or cwd
    if tool == "Bash":
        check_bash(ti.get("command") or "", cwd, pre_kickoff, after_deadline)
    elif tool in ("Write", "Edit", "MultiEdit", "NotebookEdit") and pre_kickoff:
        check_write(ti.get("file_path") or ti.get("notebook_path"), project_dir)


if __name__ == "__main__":
    main()
