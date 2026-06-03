# School Selection Admission Probability Design

## Goal

When the "美本选校系统" generates a school-selection result, each recommended school should include an estimated admission probability range, such as `5%-10%` or `15%-25%`.

## Product Stance

Use probability ranges instead of single-point percentages. The range is an AI-assisted planning estimate, not an admission promise. UI and exports should label the field as "录取概率区间" and keep the existing risk level, match reason, gaps, and next action fields.

## Data Shape

Each school item in `selection.rounds.*[]` gains:

```json
{
  "admissionProbability": "5%-10%"
}
```

The field is required for newly generated school-selection results. Existing saved results without the field should still render and export with a fallback such as "待估算".

## Implementation Approach

The server prompt asks DeepSeek to output `admissionProbability` as a range and to avoid guaranteeing results. Server validation normalizes the field and rejects generated schools that omit it. The front end renders an editable input per school, collects edits, saves the value inside version JSON, and includes it in SVG and Word exports.

## Tests

Add tests that fail before implementation and pass after:

- Server validation keeps `admissionProbability`.
- Server prompt/schema asks for probability ranges and repeats the non-guarantee stance.
- API response preserves the value.
- The school-selection page script renders, collects, and exports the field.
