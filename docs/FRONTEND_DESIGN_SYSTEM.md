---
type: design-system
created: 2026-06-16
updated: 2026-06-16
tags:
  - frontend
  - design-system
  - ui
  - color
---

# Frontend Design System

## Design Read

US College Compass is a trust-first education planning workspace for students and parents. The interface should feel calm, academic, structured, and repeatable. It is a working tool, not a marketing-heavy brand site.

Default direction:

- Design variance: 4
- Motion intensity: 2
- Visual density: 6
- System: native HTML/CSS with shared semantic tokens

## Layout Strategy

Keep the current information architecture and route structure.

- Public home: landing + auth card. It owns conversion and first trust.
- Logged-in app: left command sidebar + right workspace. It owns task flow and repeat use.
- Page structure: title bar, action summary banner, main work panel, secondary results/history.
- Top bars should identify the page and account state. They should not carry every page action.
- Page summary banners should hold the current priority, primary action, and 2-3 useful metrics.

## Button Strategy

Each screen has one primary action.

- Green: standard primary action, save, apply, continue.
- Amber: strong next action, generate, start, current recommendation.
- White/green: secondary actions, export, open related page, clear filters.
- Red: destructive or irreversible actions only.

Danger actions should stay in secondary menus when possible.

## Color System

The palette is warm neutral + deep academic green + restrained amber action + blue information state.

| Role | Token | Value |
| --- | --- | --- |
| Canvas | `--color-canvas` | `#f8f7f1` |
| Surface | `--color-surface` | `#ffffff` |
| Subtle surface | `--color-surface-subtle` | `#f5f7f2` |
| Primary text | `--color-text` | `#132033` |
| Strong text | `--color-text-strong` | `#0f172a` |
| Muted text | `--color-text-muted` | `#5f6b7a` |
| Border | `--color-border` | `#dde4dc` |
| Strong border | `--color-border-strong` | `#c7d2ca` |
| Brand | `--color-brand` | `#287250` |
| Brand strong | `--color-brand-strong` | `#1f5f43` |
| Action | `--color-action` | `#b45309` |
| Info | `--color-info` | `#2f6fb3` |
| Danger | `--color-danger` | `#b42318` |

Usage rules:

- Green is the product identity and normal progress color.
- Amber is reserved for high-intent actions and recommended next steps.
- Blue is for DeepSeek, RAG, source-backed information, and resource discovery.
- Red is only for error, risk, deletion, and boundary warnings.
- Avoid adding new near-duplicate off-whites, pale greens, or pale yellows without mapping them to a token first.

## Page Accents

- Public landing: warm neutral canvas, white auth card, amber hero CTA, green proof/brand markers.
- Command center: green priority banner, amber recommended next step.
- My activities: green completion and saved-state surfaces.
- Ask DeepSeek: blue information accents, green/amber only for send/generate actions.
- School selection: green generation flow, amber for ED/risk attention.
- Resource library: blue discovery and source accents, green for applied filters.
- Support/legal pages: mostly neutral, fewer metrics, minimal accent.

## Implementation Notes

- Preserve `--brand-green: #287250` and `--brand-orange: #a86400` for current tests and brand continuity.
- Add new semantic tokens instead of rewriting every old selector at once.
- Prefer appended cascade overrides for the first rollout because `styles.css` already contains active uncommitted work.
- Verify with `npm run verify` and a desktop/mobile browser smoke check.
