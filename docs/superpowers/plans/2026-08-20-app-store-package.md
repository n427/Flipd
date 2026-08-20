# App Store Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a source-controlled, truthful App Store submission package and operator verification runbook.

**Architecture:** Keep public copy and checklists in Markdown under `mobile/store/`; keep secrets and App Review credentials out of git. A validation script enforces Apple field limits and required sections without attempting to submit anything.

**Tech Stack:** Markdown, Node.js validation script, Expo CLI, EAS CLI operator commands.

**Spec:** `docs/superpowers/specs/2026-08-20-mobile-app-store-readiness-design.md`

## Global Constraints

- No credentials, Apple IDs, OTP bypasses, private keys, or production secrets are committed.
- Screenshots must come from the real TestFlight UI, not fabricated mock screens.
- Operator-only steps remain unchecked until performed by the owner on production infrastructure.

---

### Task 1: Metadata and validation

**Files:**
- Create: `mobile/store/metadata.md`
- Create: `mobile/store/privacy-labels.md`
- Create: `mobile/store/age-rating.md`
- Create: `mobile/store/review-notes.md`
- Create: `mobile/scripts/validate-store-package.mjs`
- Modify: `mobile/package.json`

**Interfaces:**
- Produces: `npm run store:validate`.

- [ ] **Step 1: Write the validator first so it fails when required files/sections are absent and checks name ≤30, subtitle ≤30, promotional text ≤170, keywords ≤100 bytes**

- [ ] **Step 2: Run `npm run store:validate` and verify RED due to missing package files**

- [ ] **Step 3: Add truthful proposed metadata: name `Flipd`, subtitle `The USC student marketplace`, primary category `Shopping`, support URL `https://www.flipdcampus.com/support`, privacy URL `https://www.flipdcampus.com/privacy`, and copy describing verified USC access, listings, requests, messaging, reporting, and blocking without unsupported claims**

- [ ] **Step 4: Add privacy and age-rating worksheets that enumerate account identifiers, user content, photos/videos, coarse/precise location use, push token, diagnostics, messaging, moderation, and the owner decisions required in App Store Connect**

- [ ] **Step 5: Add review notes with the OTP constraint, the literal instruction `ADD REVIEW CREDENTIALS PRIVATELY IN APP STORE CONNECT — DO NOT COMMIT THEM`, exact navigation paths, account-deletion location, and support contact**

- [ ] **Step 6: Run the validator and verify exit 0**

- [ ] **Step 7: Commit**

```bash
git add mobile/store mobile/scripts/validate-store-package.mjs mobile/package.json
git commit -m "docs(mobile): add App Store metadata package"
```

### Task 2: Screenshot and TestFlight runbook

**Files:**
- Create: `mobile/store/screenshots.md`
- Create: `mobile/store/release-runbook.md`

**Interfaces:**
- Produces a five-shot real-product storyboard and exact operator gates for EAS/TestFlight/App Store Connect.

- [ ] **Step 1: Document five authenticated portrait shots: USC marketplace feed, listing detail and verified seller, safe request flow, post composer, and messaging/report controls; specify the current 6.9-inch accepted output sizes and require real build chrome/content**

- [ ] **Step 2: Document production checks in order: verify public env, increment build number, `eas build --platform ios --profile production`, install TestFlight build, test auth/camera/photos/push/deep links/SecureStore/keyboard/VoiceOver/Dynamic Type/deletion, capture screenshots, complete privacy/age/export answers, add review credentials privately, submit manually**

- [ ] **Step 3: Include an explicit iPad decision: disable tablet support before build or capture required iPad screenshots and test layouts**

- [ ] **Step 4: Run `npm run store:validate`, Expo Doctor, public Expo config inspection, and `git diff --check`; verify exit 0**

- [ ] **Step 5: Commit**

```bash
git add mobile/store/screenshots.md mobile/store/release-runbook.md
git commit -m "docs(mobile): add TestFlight and screenshot runbook"
```

### Task 3: Final automated release gate

**Files:**
- Modify: `mobile/store/release-runbook.md`

**Interfaces:**
- Consumes every completed task from the account-compliance and native-safety plans.

- [ ] **Step 1: Run `npm test -- --run`, root lint/typecheck/build, mobile typecheck/lint, Expo Doctor, `npm run store:validate`, and production iOS export with production-shaped public variables**

- [ ] **Step 2: Record command, date, commit SHA, and pass/fail result in the runbook; do not mark physical-device or Apple-account gates complete**

- [ ] **Step 3: Inspect `git status --short`, `git diff --check`, generated Expo config, bundle output, and dependency audit; document remaining operator gates accurately**

- [ ] **Step 4: Commit only if the recorded evidence reflects fresh successful runs**

```bash
git add mobile/store/release-runbook.md
git commit -m "chore(mobile): record App Store release verification"
```
