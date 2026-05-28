# Login Authentication Design

## Goal

Add a real multi-user login system to the US college application consultant app while keeping the current lightweight Node.js server and static frontend structure.

The first version supports open registration, immediate access after registration, regular users, and an admin role reserved for seeded or environment-created accounts.

## Current Project Context

The app currently runs from `server.mjs` using Node's native HTTP server. It serves static files and exposes two API routes:

- `GET /api/prompt`
- `POST /api/plan`

There is no current authentication, session handling, user storage, or database layer. The frontend is a static page in `index.html` with behavior in `src/client/app.js`. Draft data is currently stored in browser `localStorage`.

## Chosen Approach

Use a lightweight native authentication system:

- SQLite for persistent user and session data.
- HTTP-only cookie sessions.
- Password hashing before storage.
- Native Node HTTP routing, without migrating to Express.
- A small set of auth modules instead of putting all auth logic into `server.mjs`.

This matches the existing codebase size and avoids a broad framework migration.

## User Roles

The system has two roles:

- `user`: default role for anyone who registers through the frontend.
- `admin`: reserved role for accounts created through an initialization path, such as environment variables or a local seed command.

The public registration form must not allow users to choose `admin`.

For the first implementation, the admin role only exists in the data model and current-user response. Admin-only account management screens are out of scope unless requested later.

## Database Design

SQLite data should live in a local data directory that is ignored by git.

### `users`

Fields:

- `id`: primary key.
- `email`: unique, normalized lowercase email.
- `name`: display name.
- `role`: `user` or `admin`.
- `password_hash`: hashed password.
- `created_at`: ISO timestamp.
- `updated_at`: ISO timestamp.

### `sessions`

Fields:

- `id`: primary key.
- `user_id`: foreign key to `users.id`.
- `token_hash`: hash of the random session token.
- `expires_at`: ISO timestamp.
- `created_at`: ISO timestamp.

The browser receives only the raw random session token in an HTTP-only cookie. The database stores only the token hash.

## Server Modules

### `auth-db.mjs`

Responsibilities:

- Open the SQLite database.
- Create required tables and indexes if missing.
- Expose small database helpers used by the auth service.

### `auth-service.mjs`

Responsibilities:

- Register a user.
- Reject duplicate emails.
- Hash passwords.
- Verify login credentials.
- Create sessions.
- Read the current user from a request cookie.
- Destroy sessions on logout.
- Clean expired sessions opportunistically.

### `server.mjs`

Responsibilities added:

- Parse cookies.
- Set and clear auth cookies.
- Route auth API requests.
- Protect app pages and sensitive APIs.

## API Design

### `POST /api/auth/register`

Request body:

```json
{
  "email": "student@example.com",
  "name": "Student Name",
  "password": "example-password"
}
```

Behavior:

- Validate email, name, and password.
- Create a `user` role account.
- Create a session.
- Set the session cookie.
- Return the public user object.

### `POST /api/auth/login`

Request body:

```json
{
  "email": "student@example.com",
  "password": "example-password"
}
```

Behavior:

- Validate credentials.
- Create a session.
- Set the session cookie.
- Return the public user object.

Login failures should use a generic message such as "Invalid email or password".

### `POST /api/auth/logout`

Behavior:

- Delete the current session if present.
- Clear the session cookie.
- Return success.

### `GET /api/auth/me`

Behavior:

- Return the current public user if the session is valid.
- Return `401` if not logged in.

Public user shape:

```json
{
  "id": 1,
  "email": "student@example.com",
  "name": "Student Name",
  "role": "user"
}
```

## Route Protection

The first version protects API and data access:

- `GET /api/prompt`
- `GET /course-helper.html`
- `POST /api/plan`
- `GET /data/*.md`

Static assets required by the login/register screen remain public:

- CSS
- frontend JavaScript
- auth-related static page shell

Frontend document routes such as `GET /` and `GET /index.html` return the app shell even when unauthenticated so the frontend can render the login/register screen. The protected application data loads only after authentication succeeds.

## Frontend Behavior

On page load:

1. Call `GET /api/auth/me`.
2. If authenticated, show the existing application.
3. If unauthenticated, show the login/register view.

Login/register view:

- Email input.
- Password input.
- Name input for registration.
- Toggle between login and registration.
- Inline error messages for validation and server failures.
- Disable submit while the request is in flight.

Authenticated view:

- Show the existing consultant tool.
- Add current user name/email in the top bar.
- Add a logout button.

Registration success:

- Automatically logs the user in.
- Shows the main app immediately.

Logout:

- Calls `POST /api/auth/logout`.
- Clears the visible authenticated state.
- Returns to login/register view.

Existing local drafts remain in `localStorage` for the first version. Moving drafts into per-user server storage is out of scope.

## Security Requirements

- Never store plaintext passwords.
- Hash passwords with a modern password hashing strategy available in the project runtime.
- Store only session token hashes in SQLite.
- Use `HttpOnly` and `SameSite=Lax` on the session cookie.
- Use `Secure` cookies only when the app is running behind HTTPS or explicitly configured for production.
- Normalize emails to lowercase before uniqueness checks.
- Use generic login failure messages.
- Enforce a minimum password length of 8 characters.
- Do not allow frontend registration to set role.

## Error Handling

Validation errors return `400`.

Duplicate email returns `409`.

Invalid login returns `401`.

Unauthenticated protected routes return:

- `401` JSON for API routes.
- The public app shell for frontend routes, so the frontend can render login.

Unexpected auth errors return `500` with a generic message.

## Testing Plan

Add focused tests for:

- Registering a valid user creates a user and session.
- Duplicate email registration fails.
- Login succeeds with the correct password.
- Login fails with the wrong password.
- `GET /api/auth/me` resolves a valid session.
- Logout invalidates the session.
- Expired sessions are rejected.

Keep existing tests passing and run syntax checks:

```powershell
Get-ChildItem tests\*.test.mjs | ForEach-Object { node $_.FullName }
node --check server.mjs
node --check app.js
```

The implementation may add an `npm test` script that runs the same test set.

## Out Of Scope

- Email verification.
- Password reset email flow.
- Admin account management UI.
- Per-user cloud draft storage.
- Third-party OAuth login.
- Migrating from native Node HTTP to Express.

## SQLite Dependency

Use `better-sqlite3` for the first implementation because the app is a small native Node HTTP server and the synchronous API keeps the auth service simple. If installation fails on the Windows environment because of native dependency issues, pause and choose an alternative deliberately instead of silently switching storage backends.
