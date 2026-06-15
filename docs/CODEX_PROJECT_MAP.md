# Codex Project Map: US College Application Consultant

## Project Shape

This is a static HTML plus native Node.js application. There is no frontend build step and no bundler. Browser pages import ESM modules directly from `src/client/` and `src/domain/`, so file moves can break runtime paths even when tests pass.

## Primary Entry Points

| Area | Files |
| --- | --- |
| Local server | `server.mjs` |
| Global style | `styles.css` |
| Main planning page | `index.html`, `src/client/app.js` |
| My activities / profile | `my-activities.html`, `src/client/my-activities.js` |
| Ask DeepSeek RAG | `ask-deepseek.html`, `src/client/ask-deepseek.js`, `src/server/deepseek-rag-service.mjs` |
| School selection | `school-selection.html`, `src/client/school-selection.js`, `src/server/school-selection-service.mjs` |
| Planning tracker | `planning-tracker.html`, `src/client/planning-tracker.js`, `src/domain/progress-planner.mjs`, `src/server/progress-planner-service.mjs` |
| Admin dashboard | `admin.html`, `src/client/admin-dashboard.js`, server admin routes in `server.mjs` |
| Resource library | `resource-library.html`, `src/client/resource-library.js`, parsers under `src/domain/` |
| GPA / course / major / school tools | corresponding `*.html`, `src/client/*.js`, and `src/domain/*.mjs` modules |

## Directory Responsibilities

- `src/client/`: browser-only page behavior, DOM reads/writes, fetch calls, UI state, rendering helpers.
- `src/domain/`: framework-free business logic, parsers, recommenders, exports, and calculations. Prefer putting testable logic here.
- `src/server/`: Node-only services for auth, persistence, mail, DeepSeek, RAG, school selection, and planning state.
- `src/shared/`: small utilities shared by client and server, currently including privacy guards.
- `tests/`: plain Node test files, one focused behavior area per file where possible.
- `data/`: runtime business data in Markdown and SQLite. Markdown here is application input, not documentation clutter.
- `prompts/`: fixed product prompts. Treat as sensitive business logic.
- `docs/`: maintenance docs, specs, project maps, and plans that are not runtime data.
- `scripts/`: project maintenance scripts used by npm commands.

## Server Map

`server.mjs` owns:

- Static file serving and cache headers.
- Request body parsing and JSON responses.
- Security headers.
- Session cookies and auth route wiring.
- Rate limits for auth, feedback, DeepSeek, portfolio, school selection, and analytics endpoints.
- Generation job stores for longer-running model calls.
- API routes for planning, activities, student profile, RAG, school selection, feedback, analytics, and admin.

When changing server behavior, first identify whether the logic belongs directly in `server.mjs` or in an existing `src/server/*-service.mjs` module. Prefer service modules when behavior can be tested independently.

## Frontend Page Script Map

| Page | Main script |
| --- | --- |
| `index.html` | `src/client/app.js` |
| `admin.html` | `src/client/admin-dashboard.js` |
| `ask-deepseek.html` | `src/client/ask-deepseek.js` |
| `course-helper.html` | `src/client/course-helper.js` |
| `feedback.html` | `src/client/feedback.js` |
| `gpa-calculator.html` | `src/client/gpa-calculator.js` |
| `major-encyclopedia.html` | `src/client/major-encyclopedia.js` |
| `my-activities.html` | `src/client/my-activities.js` |
| `planning-tracker.html` | `src/client/planning-tracker.js` |
| `resource-library.html` | `src/client/resource-library.js` |
| `school-encyclopedia.html` | `src/client/school-encyclopedia.js` |
| `school-selection.html` | `src/client/school-selection.js` |

Most pages also load `src/client/admin-nav.js` and `src/client/safe-navigation.mjs`.

## Data And Prompt Map

- `data/admission-cases.md`: admission case source for similarity matching.
- `data/competitions.md`: competition recommendation source.
- `data/summer-schools.md`: summer school recommendation source.
- Other `data/*.md`: resource library and school/application knowledge sources.
- `data/auth.sqlite`: local SQLite database; ignored by git and should not be deleted casually.
- `prompts/us-college-admissions-strategist-agent.md`: fixed planning agent prompt; do not change without explicit request.

## Testing Map

- `npm run check` runs `node --check` on `server.mjs`, `src/**/*.mjs/js`, and `scripts/**/*.mjs/js`.
- `npm test` runs every `tests/*.test.mjs` in sorted order.
- `npm run verify` runs syntax checks first, then all tests.

Use targeted tests during iteration when possible, then `npm run verify` before final response.

## Common Task Routes

### Add Or Fix A Page Interaction

Read:

1. The relevant `*.html`.
2. The page script in `src/client/`.
3. Any imported domain modules.
4. Matching `tests/*page*`, `tests/*layout*`, or page-specific test.

Verify:

- `npm run verify`.
- Browser smoke check if visual or interactive behavior changed.

### Add Or Fix A Recommendation Algorithm

Read:

1. The corresponding `src/domain/*recommender.mjs` or parser.
2. Relevant `data/*.md` shape, sampling only enough to understand structure.
3. Existing tests for that recommender.

Verify:

- Relevant recommender/parser tests.
- `npm run verify`.

### Change Auth, Sessions, Or User Data

Read:

1. `server.mjs` auth route area.
2. `src/server/auth-service.mjs`.
3. `src/server/auth-db.mjs`.
4. `src/shared/privacy-guards.mjs` if draft/profile data is involved.
5. Auth and server tests.

Verify:

- Auth/server tests.
- `npm run verify`.
- Manual privacy/security review.

### Change DeepSeek Or RAG Behavior

Read:

1. `src/server/api-key.mjs`.
2. `src/server/deepseek-model.mjs`.
3. The relevant DeepSeek service.
4. The page client that calls it.
5. Existing DeepSeek/RAG tests.

Verify:

- DeepSeek/RAG tests.
- `npm run verify`.
- Do not require real API keys in tests.

### Change Export Behavior

Read:

1. `src/domain/word-export.mjs`.
2. `src/domain/svg-export.mjs` if SVG export is involved.
3. Client call sites in `app.js` or `my-activities.js`.
4. Export tests.

Verify:

- Export-specific tests.
- `npm run verify`.

## Browser Smoke Checklist

For frontend changes, check at least:

- Desktop viewport around 1280px width.
- Mobile viewport around 390px width.
- Affected page loads without console-breaking errors.
- Primary action remains visible and clickable.
- Text does not overlap, truncate awkwardly, or spill outside controls.
- Navigation drawer/header still works on mobile if the page uses it.

## Known Gotchas

- `start-consultant.cmd` sets `PORT=4179`; bare `node server.mjs` or `npm start` defaults to `4177`.
- Some HTML imports use cache-busting query strings. Keep or update them intentionally.
- Markdown under `data/` is runtime input, not docs.
- The app contains local-only files such as `.env`, `data/auth.sqlite`, temp registration JSON, and exports. Do not commit or expose them.
- Server tests should not require real DeepSeek or SMTP credentials.
- Static page script paths are brittle because there is no bundler to rewrite imports.
