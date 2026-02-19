# Changelog - Internal (no API impact)

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
