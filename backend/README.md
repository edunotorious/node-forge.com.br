# Backend (Node-Forge)

FastAPI service. For local development, bring up the stack with
`docker compose up postgres backend -d`, then apply migrations:

```bash
docker compose exec backend uv run alembic upgrade head
```

The service listens on `http://localhost:8000`. In normal operation only the
Next.js proxy talks to it; direct hits are for debugging only.

## Endpoints

### `GET /health`

Liveness probe. Does not touch the database.

```bash
curl http://localhost:8000/health
# 200 {"status":"ok"}
```

### `POST /auth/register`

Create a new user. Email is normalized via `lower().strip()` server-side, so
`Alice@x.com` and `alice@x.com` collide and the second call returns 409.

```bash
curl -X POST http://localhost:8000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","password":"hunter22hunter22"}'
# 201
# {"id":"...","email":"alice@example.com","created_at":"..."}
```

Validation:
- `email` must be a syntactically valid address (`pydantic[email]`).
- `password` length is 12–72 chars (12 follows NIST 2024+ guidance; 72 is
  bcrypt's input cap).

### `POST /auth/login`

Authenticate. On success the JWT is set as an httpOnly cookie *and* returned in
the body — body is for non-browser clients (curl, mobile), the cookie is what
the Next proxy forwards from the browser.

```bash
curl -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -c cookies.txt \
  -d '{"email":"alice@example.com","password":"hunter22hunter22"}'
# 200
# {"access_token":"eyJhbGciOi...","token_type":"bearer"}
```

Failure modes (both return `401 {"detail":"Invalid credentials"}`):
- email not registered (still runs bcrypt against a dummy hash to keep timing
  constant — defends against email enumeration via response latency)
- password mismatch

### `GET /auth/me`

Return the current user. Requires the `access_token` cookie set by `/login`.

```bash
curl http://localhost:8000/auth/me -b cookies.txt
# 200 {"id":"...","email":"alice@example.com","created_at":"..."}
```

Without a valid cookie: `401 {"detail":"Not authenticated"}`.

### `POST /auth/logout`

Clear the auth cookie. Returns 204 with no body.

```bash
curl -X POST http://localhost:8000/auth/logout -b cookies.txt -c cookies.txt -i
# HTTP/1.1 204 No Content
# set-cookie: access_token=""; Max-Age=0; ...
```

## Implementation notes

- **bcrypt cost factor 12** (~250 ms per hash on a modern CPU). Used for both
  real password hashing and the dummy timing-defense path.
- **JWT HS256**, expires after `JWT_EXPIRE_DAYS` (default 7). Subject is the
  user's UUID. Secret comes from `JWT_SECRET`.
- **Cookie attributes:** `httpOnly=True, samesite=Lax, path=/`. The `secure`
  flag comes from `COOKIE_SECURE` (default `true`). `Lax` is correct because
  the browser only ever talks to the Next.js origin (which proxies to FastAPI
  internally), so the cookie is first-party. Browsers' localhost exception
  lets `Secure=true` work for browser dev over HTTP — but curl refuses to send
  Secure cookies on HTTP, so set `COOKIE_SECURE=false` in `.env` when
  exercising the endpoints with curl/cookies.txt.
- **Email normalization** is enforced via a Pydantic `field_validator` on every
  request schema — single point of normalization at the API boundary.
- **Tests:** manual via the `curl` recipes above. Pytest is intentionally
  deferred to a later quality-focused PR; not part of MVP scope.
