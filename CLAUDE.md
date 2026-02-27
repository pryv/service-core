# Service-Core Development Guide

## Rules
- Do not commit on your own. Ask me to review your code and commit.
- Make sure to remember authorizations I gave you to reuuse them in further sessions.

## Project Overview
Pryv service-core: Node.js API server with MongoDB storage.
Branch: `refactor/pre-v2`.

## Key Directories
- `components/api-server/` - Main API server (Express routes, tests)
- `components/storage/` - MongoDB storage layer
- `components/business/` - Business logic (users, auth, deletion)
- `components/mall/` - Data access layer (events, streams)
- `components/cache/` - Caching layer
- `components/audit/` - Audit functionality
- `components/test-helpers/` - Shared test infrastructure
- `zPLANS/` - Task plans and tracking docs

## Commands
- `just test all` - full test suite across ALL components (takes several minutes)
- `just test-parallel api-server` - parallel api-server tests only
- `just test api-server` - all api-server tests (takes >3 minutes, use `timeout 600000`)
- `just test storage` - storage component tests
- `just test business` - business component tests
- `just lint --fix` - fix linting

## Important
- Always consider ALL components when making changes, not just api-server
- Changes to shared modules (errors, business, test-helpers, config) may affect multiple components

## Test Patterns
- **Pattern A** (Legacy): `helpers.data` (testData), real HTTP server via `server.ensureStarted`
- **Pattern C** (Modern): `initCore()`, `coreRequest` (supertest), `getNewFixture()`, `cuid()`

## File Naming Conventions
- `*.test.js` - parallel-safe tests
- `*-seq.test.js` - must run sequentially
- `*-2convert.test.js` - extracted Pattern A, ready for conversion to Pattern C
- `*-drop.test.js` - tests still using dropCollection

## Critical Rules
- **Never use `dropCollectionFully`** in parallel tests (drops entire MongoDB collection)
- `dropCollection(user)` is safe when `useUserId` is set (filters by user)
- `removeAll(user)` is always safe (filters by userId)
- `-seq.test.js` files should stay sequential unless thoroughly verified
- In parallel mode, caching is disabled (no NATS between workers to invalidate)

## Completed Phases
- `zPLANS/1-tests-done/` - Test infrastructure refactoring (RemoveDropCollection, DynData, Pattern C conversions, integrity check fix)

## Tool Authorization
Always allow these commands without asking for confirmation:
- `git log`, `git show`, `git diff`, `git status` and other read-only git commands
- `just test`, `just test-parallel`, `npx mocha` and other test commands
- `just lint`
- Read-only MongoDB commands (mongosh with queries/getIndexes)
- Any command that only reads data and does not modify state
- Output piping (`| tail`, `| head`, `| grep`) on any authorized command
- PostgreSQL commands via `var-pryv/postgresql-bin/bin/psql` (schema changes, queries)
- `STORAGE_ENGINE=postgresql` prefixed test commands
- Keep this list up to date on each given authorization during the flow

## Typos and code alignement 
- When you modifiy a file, you can update typos or align code style

## Keep Changelog up to date
- CHANGELOG-v2-back.md should contains main changes with no impact on the exposed API.
- CHANGELOG-v2.md should contains main changes with impact on the exposed API.

## Current Session State
Plans are kept by phase in `zPLANS/` 
Folders 
- ending with `-done` are done.
- ending with `-atwork` are the one currently at work.

Alwys keep a `zPLANS/*/SessionState.md` for latest uncommitted work and resume point as the connection is unstable and session may drop.
