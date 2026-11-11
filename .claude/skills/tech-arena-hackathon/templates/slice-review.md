# Slice review (James, Charlotte; Hannah at freeze)

Write once. Empty sections say "None."

```markdown
## REVIEW: <reviewer> on ta/S<n>-<slug> @ <short sha>
VERDICT: APPROVE | APPROVE WITH FIXES | ESCALATE
Checked: <tests run → verbatim summary line> · <screens viewed, for UI>

### BLOCKER
- [ ] B1 [SCI] src/astro/sky.ts:42: Scenario: site at lon −30 → azimuths mirrored. Fix: treat longitude as east-positive before building the body-fixed vector.

### MINOR
- [ ] M1 [UX] src/ui/Countdown.tsx:18: Scenario: 0 h 59 m shown as "0:59" → reads as seconds. Fix: render "59 min".
```

`ESCALATE` only when the approach is wrong at the root and one fix pass can't make it right. Marcus takes it to Atlas.
