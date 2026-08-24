# DECISIONS LOG

Format: date | decision | context | alternatives | consequences. Future agents must NOT undo these casually.

## DEC-GC-001 — 2026-08-24 — Zed vault deprecated as context source
Owner directive: vault is stale/broken; do not rely on it or perform vault-sync rituals.
Canonical context = this `.ai/` directory (+ workspace `.ai_memory/` as thin pointer).
Alternatives rejected: repairing vault (owner explicitly deferred), vault-only memory.
Consequences: AGENTS.md/CLAUDE.md vault instructions are superseded for this project until owner revisits.

## DEC-GC-002 — 2026-08-24 — origin/main is authoritative history
Aug 3 author-email rewrite created 24 patch-identical local duplicates; verified via `git cherry`;
resolved by stash->reset->stash-pop. No unique local content lost. Rule: never force-push/rebase
published main without owner sign-off.

## DEC-GC-003 — 2026-08-24 — Production verdict: DO-NOT-APPROVE
11-audit hostile sweep. Approved envelope TODAY = single trusted operator, local machine,
UNRESTRICTED_ACCESS=false, APPROVAL_ENABLED=true, no untrusted web content in context.
Multi-user operation is categorically unsupported (identity layer does not exist).
Full basis: `.ai/AUDITS/2026-08-24-hostile-audit.md`. Consequence: GC-000..GC-010 gate any release talk.

## DEC-GC-004 — 2026-08-24 — UNRESTRICTED_ACCESS policy
Must be `false` in every persistent environment. `true` voids approvals AND path validation AND
rewrites tool descriptions. Only hard guard is prod boot-throw; local dev has none.
Consequence: test suites that exercise approvals REQUIRE env override at invocation time
(see TEST_STATUS.md), never a persistent .env flip.

## DEC-GC-005 — 2026-08-24 — Skills system classification
Conditional single-operator ONLY until GC-006 lands. Directory-to-executable conversion at boot,
frontmatter env override, and quote-breakout arg injection make skills RCE-adjacent by design.
Do not "fix" by disabling approvals around them.

## DEC-GC-006 — 2026-08-24 — Governance model adopted
5-engineer ownership matrix + review gates (docs/team/ENGINEERING_ORG.md) governs who reviews what:
Production gate = Elena+Priya (either blocks); Security = Priya veto + Maya cross-review;
Architecture = Maya; Two-person-review list applies to listed security files.
Consequence: PRs/checkpoints should reference gate outcomes in their description.

## DEC-GC-007 — 2026-08-24 — Canonical memory hierarchy (anti-duplication)
`.ai/` (per-project, versioned) = canonical project OS. `D:\Projects\.ai_memory\` = cross-session
handoff pointer layer; must reference `.ai/`, never mirror its content. No third system permitted.
