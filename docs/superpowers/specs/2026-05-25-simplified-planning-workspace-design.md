# Simplified Planning Workspace Design

**Date:** 2026-05-25

## Goal

Make the existing student profile, multiple-plan, and snapshot workspace understandable on first use without removing any saved-data capability.

## Approved User Flow

The workspace becomes a visible three-step guide:

1. **填写学生信息** - direct the user to the existing background input form.
2. **选择一个规划方案** - keep the default plan and allow creating another plan when comparing routes.
3. **保存重要版本** - present snapshots as simple historical backups that can be restored later.

## Interface Changes

- Rename the panel heading from product terminology to an action-oriented title such as `三步完成申请规划`.
- Show three short instructions permanently in the panel rather than requiring the user to infer how it works.
- Rename visible `版本历史` language to `历史备份`, and explain in one sentence that restoring will return to an earlier saved state.
- Keep `新建方案` visible as a primary task; keep rename and delete available but visually secondary.
- Replace technical status and confirmation copy with plain Chinese action wording.

## Behavior Preserved

- Student information remains shared by all plans in one account.
- Each plan continues to save its own current draft.
- Creating a backup continues to create an immutable snapshot.
- Restoring a backup continues to restore the profile and current plan contents.
- Existing Agent generation, recommendation rendering, and JSON/Word export continue to operate on the selected plan.

## Error And Safety Handling

- Warn before discarding unsaved changes when switching or creating another plan.
- Continue preventing deletion of the final remaining plan.
- Display save, load, backup, and restore outcomes using user-facing wording.

## Verification

- Extend the workspace layout test to assert the three-step instructions and simplified terminology.
- Run project tests and syntax checks after the HTML, CSS, and client copy updates.
