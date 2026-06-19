# Contributing to PromptMeter

Thanks for your interest in contributing! This document covers the legal basics and the practical workflow.

## License & contributor terms (read this first)

PromptMeter is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0) — see [LICENSE](./LICENSE). In short: if you run a modified version of PromptMeter as a network service, you must make your modified source available to its users.

We require all contributors to sign a **Contributor License Agreement (CLA)** before their first contribution is merged — see [CLA.md](./CLA.md). The CLA lets the project maintainer offer PromptMeter under both the open-source AGPL license **and** a separate commercial license. This dual-licensing model is what funds continued open-source development; your contribution stays open-source forever under the AGPL.

**You retain copyright to your contributions.** The CLA grants the maintainer a license to your work — it does not transfer ownership.

### How to sign

Until automated CLA tooling is in place: in your first pull request, include a comment stating:

> I have read and agree to the PromptMeter CLA (CLA.md). Signed: <your name / GitHub handle>

(We'll migrate to a CLA bot before accepting contributions at volume.)

## Source-file headers

New source files should carry a short header:

```
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nabil Khoury and PromptMeter contributors
```

## Estimates are the product — accuracy rules

PromptMeter's credibility depends on never presenting an estimate as a fact. When contributing anything that produces a number:

- **Pricing** lives in `data/models.json` and is the source of truth. Keep it current and cite the provider's pricing page in your PR.
- **Label confidence.** Computed-from-pricing costs are one thing; latency and carbon are *directional estimates* and must be labeled as such in the UI.
- **Document methodology.** Any new estimate (latency, carbon, overflow probability) needs a short written explanation of how it's derived. "Show your work" is a feature, not overhead.
- **Keep `lib/` pure and tested.** Estimation math is the highest-risk surface — add unit tests.

## Workflow

1. **Open an issue first** for anything beyond a small fix — describe the change before writing code.
2. Fork, branch, and keep PRs focused (one logical change).
3. Run the linter, formatter, and tests locally before pushing.
4. Reference the issue in your PR and include the CLA acknowledgement (first PR only).

## Good first contributions

- Keeping `data/models.json` accurate as providers update pricing or ship new models.
- Adding a missing model with verified pricing + context window.
- Improving test coverage in `lib/`.

## Code of conduct

Be respectful and constructive. Harassment or hostile behavior isn't tolerated.
