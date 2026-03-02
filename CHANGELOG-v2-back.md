# Changelog - Internal (no API impact)

## Phase 6c: Cleanup NATS/Axon Naming Remnants

- Renamed all internal `nats`/`NATS` variable names, function names, comments, and config references to generic `transport`/`Transport` terms
- `NATS_MODE_ALL/KEY/NONE` → `TRANSPORT_MODE_ALL/KEY/NONE` (backward compat aliases kept)
- `initNats()` → `initTransport()`, `isNatsEnabled()` → `isTransportEnabled()`, `setTestNatsDeliverHook()` → `setTestDeliverHook()`
- Removed dead code: `NATS_CONNECTION_URI` in webhooks, `axonMessaging` export alias, `nats:uri` compat fallback
- Removed NATS references from CI, README, .gitignore, .dockerignore, .licenser.yml

## Phase 6b: Replace NATS with Built-in TCP Pub/Sub

- Replaced NATS server + `nats` npm package with zero-dependency TCP pub/sub broker using Node.js `net` module
- Created `tcp_pubsub.js`: embedded broker/client — first process binds port, others connect as clients
- Protocol: newline-delimited JSON over TCP with noEcho (sender exclusion via client IDs)
- Updated 6 config files: `nats:uri` → `tcpBroker:port`
- Rewrote 3 test files to use raw TCP clients instead of NATS client library
- Removed NATS from Docker build (Dockerfile, runit/gnats, start-core wait loop)
- Removed `nats-server/` binary directory and `scripts/setup-nats-server`
- Removed `nats` npm dependency
- No changes to PubSub class, constants, or any consumer code

## Phase 6a: Remove Axon Test Messaging

- Replaced axon TCP pub/sub with Node.js built-in IPC for test notification forwarding
- Created `test_messaging.js` (IPC-based EventEmitter + `process.send()`), deleted `axon_messaging.js`
- Updated InstanceManager, DynamicInstanceManager, spawner.js to use IPC instead of axon TCP sockets
- Renamed `axon-*` message names to `test-*` across all test files (~20 files)
- Renamed `axonMsgs`/`axonSocket` variables to `testMsgs`/`testNotifier`
- Removed `axon` npm dependency and `axonMessaging` config sections
- No changes to production messaging (NATS) or caching

## Phase 5e: Remove FerretDB Support

- Removed FerretDB feature entirely — `ferretDB/` directory, `test-ferret` justfile recipe, `isFerret` config/property, FerretDB connection string, `ferretIndexAndOptionsAdaptationsIfNeeded()`, FerretDB duplicate error handling, FerretDB test guards
- Fixed bug in `Database.isDuplicateError()`: FerretDB branch had missing `return`, causing all errors to be reported as duplicates
- Cleaned: Database.js, localDataStore.js, accesses.js, accesses-personal.test.js, result-chunk-streaming-seq.test.js, database-seq.test.js, 4 migration test files, README-DBs.md

## Phase 5d: Engine-Agnostic Series, Deletion, and Test Fixes

### Engine-Agnostic Series Connections for Tests
- Replaced `produceInfluxConnection()` with async `produceSeriesConnection()` factory in hfs-server and api-server test helpers
- Added `getTimeDelta()` helper to normalize time values across InfluxDB (INanoDate) and PG (numeric)
- Renamed `produceMongoConnection` → `produceStorageConnection` globally across 18 test files
- Updated `store_data.test.js`, `batch.test.js`, `deletion-seq.test.js` to use engine-agnostic series queries/assertions

### PG Series Nanosecond Fix
- Fixed `pg_connection.js` `query()`: changed `delta_time * 1000` → `delta_time / 1e6` (delta_time stores nanoseconds via `InfluxDateType.coerce`, not seconds)
- Fixed field ordering: `time` placed before JSONB fields to match InfluxDB column order
- Fixed `exportDatabase()` and `importDatabase()` for consistent nanosecond↔millisecond conversion

### Engine-Agnostic HF Data Deletion
- `deletion.js` `deleteHFData()` now dispatches to PG or InfluxDB based on storage engine (was hardcoded to InfluxDB)

### Test Infrastructure Fixes
- Separated caching disable (`MOCHA_PARALLEL=1`) from integrity check disable (`DISABLE_INTEGRITY_CHECK=1`) in `helpers-base.js` and `helpers-c.js` — fixes cache tests failing under `just test-pg`
- Fixed `Webhook.test.js` user object to include `id` property — PG requires non-NULL `user_id` for SQL equality comparisons (MongoDB was tolerant of `undefined` via collection naming)

## Phase 5b: Fix PG Tests + Remove FollowedSlices + Engine-Agnostic Cleanup

### FollowedSlices Removal
- Removed FollowedSlices feature entirely (storage backends, API methods, routes, schema, tests, audit, pubsub, deletion cascade)
- Deleted: `FollowedSlices.js`, `FollowedSlicesPG.js`, `followedSlices.js` (methods), `followed-slices.js` (routes), schema files, test file
- Cleaned references from: StorageLayer, storage/index, server.js, application.js, Paths.js, constants.js, pubsub.js, ApiMethods.js, deletion.js, AccessLogic.js, databaseFixture.js, dependencies.js, dynData.js, data.js, helpers-c.js, helpers-base.js, validation.js, usersLocalIndex.js, DatabasePG schema, test list files

### Engine-Agnostic Test Helpers
- `dependencies.js` — always reconfigures via `StorageLayer` (removed `STORAGE_ENGINE` guard)
- `parallelTestHelper.js` — always uses `storage.getStorageLayer()` instead of engine switch
- `test-helpers.js` — `produceConnection()` always returns `StorageLayer`
- `profile-personal.test.js` — uses `storageLayer.profile` instead of engine switch
- Removed all `// CLAUDE:` marker comments

### HFS-Server Engine-Agnostic Fixes
- `application.js` — removed unconditional `storage.getDatabase()` call
- `context.js` — removed `mongoConn` property; constructor no longer requires database connection
- `metadata_cache.js` — `MetadataLoader.init()` no longer takes `databaseConn` param (was unused)

### Integrity Checks
- `integrity-final-check.js` — early return for non-MongoDB engines (uses raw MongoDB cursors)

## Dual Storage Engine — Phase 2: PostgreSQL Backend (Phase 5)

### Global Storage PG Backends
- `SessionsPG` — callback-based sessions with JSONB containment for `getMatching`
- `PasswordResetRequestsPG` — callback-based password reset with expiration on read
- `VersionsPG` — async versions with migration runner

### User-Scoped Storage PG Backends
- `BaseStoragePG` — base class providing full UserStorage interface with SQL query building:
  camelCase↔snake_case mapping, JSONB serialization, MongoDB-style query→SQL translation
  ($gt, $ne, $in, $or, $type, $set, $unset, $inc, $min, $max, JSONB dot-notation)
- `AccessesPG` — token generation, integrity hash, integrity-aware delete/updateOne
- `WebhooksPG` — aggressive field unsetting on soft-delete
- `ProfilePG` — JSONB data with key-value set updates
- `StreamsPG` — tree build/flatten via treeUtils, cache invalidation

### Account & Index PG Backends
- `userAccountStoragePG` — password history, key-value store (StoreKeyValueData)
- `usersLocalIndexPG` — username↔userId mapping
- `DBpostgresql` — platform unique/indexed fields

### PG DataStore for Mall (Events + Streams)
- `localDataStorePG` — DataStore factory implementing @pryv/datastore interface
- `localUserEventsPG` — full events API with junction table `event_streams` for stream queries,
  intermediate query format→SQL conversion, streaming support
- `localUserStreamsPG` — streams API with tree building, cache integration
- `LocalTransactionPG` — PG transaction wrapper

### PG Series Connection (InfluxDB Replacement)
- `pg_connection.js` — implements InfluxConnection interface using `series_data` table
- Handles writeMeasurement, writePoints, simplified InfluxQL→SQL query parsing
- Full migration support (exportDatabase, importDatabase)

### Schema Update
- Added `stream_ids JSONB` column to events table for denormalized reads

### Wiring
- `StorageLayer._initPostgreSQL` instantiates all PG backends
- All routing points wired: StorageLayer, index.js, mall, platform, hfs-server
- All Phase 2 TODOs resolved

## Dual Storage Engine — Phase 1: Configuration & Abstraction (Phase 5)

### Unified Storage Engine Configuration
- Added `storageEngine` config key ('mongodb' | 'sqlite' | 'postgresql') to `default-config.yml`
- When set, overrides all per-component keys (`database:engine`, `storageUserAccount:engine`, etc.)
- Falls back to per-component keys when absent (full backward compatibility)
- Added `postgresql` connection config block (host, port, database, user, password, max)

### Storage Engine Helper
- New `storage/src/getStorageEngine.js` — unified engine resolution with validation
- Used by all routing points: StorageLayer, index.js, mall, platform, hfs-server

### PostgreSQL Connection Wrapper
- New `storage/src/DatabasePG.js` — connection pooling via `pg`, schema DDL for all tables
- Methods: `ensureConnect()`, `waitForConnection()`, `query()`, `getClient()`, `withTransaction()`, `initSchema()`, `close()`
- Full schema: streams, events, event_streams, accesses, webhooks, profile, sessions, password_resets, versions, passwords, store_key_values, users_index, platform tables, series_data
- Static helpers: `isDuplicateError()`, `handleDuplicateError()` (mirrors MongoDB pattern)

### Engine-Aware Routing
- `StorageLayer.js` — refactored to dispatch to `_initMongoDB`/`_initSQLite`/`_initPostgreSQL`
- `storage/src/index.js` — engine routing for `getUserAccountStorage()`, `getStorageLayer()`; exports `DatabasePG`, `getDatabasePG`, `getStorageEngine`
- `usersLocalIndex.js` — engine routing via `getStorageEngine`
- `mall/src/index.js` — datastore selection by engine
- `platform/src/getPlatformDB.js` — PlatformDB selection by engine
- `hfs-server/src/application.js` — series connection selection by engine

### Dependency
- Added `pg` (node-postgres) to root dependencies

## Parallel Test Migration (Phase 4)

### Step 0: Enforce Interface Usage
- Replaced `dropCollection()` with `removeAll()` in `business/src/auth/deletion.js` (interface compliance)

### Step 1: Move Verified Pattern C Tests to Parallel
- Renamed 3 sequential files to parallel: `webhooks`, `acceptance/accesses`, `login-parallel`
- Evaluated 5 additional candidates; confirmed they must stay sequential (`getApplication()` shared state)

### Step 2: Deduplicate Sequential Tests
- Extracted `permissions-seq.test.js` sections AP01, AP02, YE49 → new `permissions.test.js` (Pattern C, parallel-safe)
- Removed 19 duplicate tests from `events-seq.test.js` (covered by `events-patternc.test.js`)
- Removed 18+5 duplicate tests from `streams-seq.test.js` (covered by `streams-patternc.test.js`)
- Added defensive assertions to `events-mutiple-streamIds.test.js` for parallel-mode debugging

### Result
- Parallel pool: 13 → 17 files (+4)
- Sequential: 21 → 13 files
- 58 duplicate tests removed, 0 coverage lost

## Formalize Storage Interfaces (Phase 3)

### User-Scoped Storage Interface (Group B) — Phase 3b
- New `UserStorage` interface with `validateUserStorage()` in `storage/src/interfaces/`
- Validates all BaseStorage subclasses: Accesses, Profile, FollowedSlices, Streams, Webhooks
- Added migration methods (`exportAll`, `importAll`, `clearAll`) to `BaseStorage`
- Conformance test suite covering full CRUD + migration lifecycle
- StorageLayer validates all user-scoped storages at construction time

### Global Storage Interfaces (Group C) — Phase 3c
- **Sessions**: `validateSessions()` interface, migration methods (`exportAll`, `importAll`)
- **PasswordResetRequests**: `validatePasswordResetRequests()` interface, migration methods (`exportAll`, `importAll`)
- **Versions**: `validateVersions()` interface, migration methods (`exportAll`, `importAll`)
- Conformance test suites for all three
- StorageLayer validates all global storages at construction time

### Dual-Engine Storage Interfaces — Phase 3a

### UserAccountStorage Interface (Group D)
- New interface prototype + `createUserAccountStorage()` factory in `storage/src/interfaces/`
- Wrapped Mongo and SQLite implementations with factory
- Added standardized migration methods: `_exportAll`, `_importAll`, `_clearAll`
- Conformance test suite; existing unit test now delegates to it

### UsersLocalIndexDB Interface (Group E)
- New interface prototype + `validateUsersLocalIndexDB()` validation in `storage/src/interfaces/`
- Added migration methods (`exportAll`, `importAll`, `clearAll`) to Mongo and SQLite classes
- Validation called after construction in `usersLocalIndex.js`

### PlatformDB Interface (Group F)
- New interface prototype + `validatePlatformDB()` validation in `platform/src/interfaces/`
- Added migration methods (`exportAll`, `importAll`, `clearAll`) to Mongo and SQLite classes
- Validation called after construction in `getPlatformDB.js`

### EventFiles Interface (Group G)
- New interface prototype + `createEventFiles()` factory + `validateEventFiles()` in `storage/src/interfaces/`
- Validation called after construction in `getEventFiles.js`

### Series / InfluxDB Interface (Group I) — Phase 3d
- New `InfluxConnection` interface with `validateInfluxConnection()` in `business/src/interfaces/`
- Added migration methods (`exportDatabase`, `importDatabase`) to `InfluxConnection`
- Conformance test suite [IC01]-[IC09] covering full lifecycle
- Exported via `business.series.interfaces.InfluxConnection`

### Audit / UserSQLite Interfaces (Group J) — Phase 3d
- New `UserSQLiteStorage` interface with `validateUserSQLiteStorage()` in `storage/src/interfaces/`
- New `UserSQLiteDatabase` interface with `validateUserSQLiteDatabase()` in `storage/src/interfaces/`
- Added migration methods (`exportAllEvents`, `importAllEvents`) to `UserDatabase`
- Conformance test suite [SQ01]-[SQ16] covering Storage manager + Database contract
- Exported via `storage.interfaces.UserSQLiteStorage` and `storage.interfaces.UserSQLiteDatabase`

### Exports & Migration Scripts
- `storage/src/index.js` exports all interfaces under `interfaces` key
- Migration scripts (`switchSqliteMongo/`) simplified using standardized `exportAll`/`importAll`/`clearAll`

## Remove Deprecated Features (Phase 2)

### Phase 0: Trivial Cleanup
- Removed commented debug code in `components/audit/src/Audit.js`
- Removed unused `factory.periodsOverlap` error and `ErrorIds.PeriodsOverlap`

### Phase 1: Remove Stream ID Prefix Backward Compatibility
- Removed `backwardCompatibility.systemStreams.prefix` config from all config files
- Removed `isStreamIdPrefixBackwardCompatibilityActive` variable and all guarded code in `events.js`, `streams.js`, `accesses.js`, `eventsGetUtils.js`
- Removed prefix conversion functions from `backwardCompatibility.js`
- Deleted `ChangeStreamIdPrefixStream.js`
- Removed `disableBackwardCompatibility` property and `disable-backward-compatibility-prefix` header from `MethodContext.js`
- Removed `PATTERN_C_BACKWARD_COMPAT` env var handling from test helpers
- Removed backward compatibility collision check in system streams config
- Removed prefix-related tests (BW08-BW16, SD02)

### Phase 2: Remove Deprecated `/register/create-user` Endpoint
- Removed deprecated `POST /register/create-user` route from `system.js`
- Removed backward-compatibility test `[ZG1L]`
- `passwordHash` parameter kept (still used by standard `POST /system/create-user`)

### Phase 3: Remove `streamId` (singular) Backward Compatibility
- Removed `streamId` property from event JSON schema (`event.js`)
- Changed schema validation from `anyOf` (streamId or streamIds) to `required: ['type', 'streamIds']`
- Simplified `normalizeStreamIdAndStreamIds` in `events.js` — removed `BOTH_STREAMID_STREAMIDS_ERROR` and all `event.streamId = event.streamIds[0]` assignments
- Deleted `SetSingleStreamIdStream.js` (no longer needed to add `streamId` to output)
- Removed `SetSingleStreamIdStream` pipe from `eventsGetUtils.js`
- Removed `event.streamId` assignment from `SetFileReadTokenStream.js`
- Updated tests across api-server and webhooks components

### Phase 4: Remove Tags Backward Compatibility
- Deleted `backwardCompatibility.js`, `AddTagsStream.js`
- Removed `backwardCompatibility.tags` from all config files
- Removed all tag conversion logic from `events.js` (replaceTagsWithStreamIds, putOldTags, createStreamsForTagsIfNeeded, cleanupEventTags, migrateTagsToStreamQueries)
- Removed tag permission methods from `AccessLogic.js`
- Simplified permission checks: removed WithTags variants, callers use stream-only methods
- Removed `tags` from event schema and events.get query params
- Removed tag migration code from `1.7.0.js`
- Fixed `previews-server/event-previews.js` to use `canGetEventsOnStream` instead of removed `canGetEventsOnStreamAndWithTags`
- Deleted tag backward compatibility tests, updated all test files
- Removed `permissions-tags.test.js` from test lists

### Phase 5: Final Cleanup
- Removed deprecated `/service/infos` route duplicate
- Cleaned stale deprecated JSDoc from Event typedef (removed streamId, tags)
- Fixed typo: `newSreamIds` → `newStreamIds` in events.js
- Fixed double `await` in repository.js
- Updated stale TODO comments about system.createUser
