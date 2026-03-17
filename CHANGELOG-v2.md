# Changelog - API Changes

## Plan 14: Merge service-core servers

- **CHANGED**: Socket.IO connections now use WebSocket transport only when running in cluster mode. HTTP long-polling fallback is no longer available in clustered deployments. Single-process mode (development, tests) is unaffected.
- **REMOVED**: Separate `pryvio/hfs` and `pryvio/preview` Docker images — all services now run in a single `pryvio/core` container via `node bin/master.js`.

## Plan 12: Refactor System Streams

- **REMOVED**: `:_system:helpers` stream and its children (`:_system:active`, `:_system:unique`) — these internal marker streams are no longer part of the system streams tree. Account field uniqueness and indexing are now enforced directly by the platform coordination layer.
- **No other API changes**: All other system stream IDs (`:_system:email`, `:_system:language`, `:system:email`, etc.) remain unchanged. Events, permissions, and stream queries work identically.

## Plan 13: Remove `openSource:isActive` Flag

- **REMOVED**: `openSource:isActive` configuration key — no longer recognized. All features (webhooks, HFS/series events, distributed cache sync, registration email check) are now always enabled regardless of deployment mode.

## Remove Deprecated Features (Phase 2)

### Phase 1: Remove Stream ID Prefix Backward Compatibility
- **REMOVED**: The old dot-prefix (`.`) notation for system stream IDs is no longer accepted or returned. Use the standard prefixes (`:_system:` for private, `:system:` for custom) exclusively.
- **REMOVED**: The `disable-backward-compatibility-prefix` HTTP header is no longer supported (no longer needed since prefix conversion is removed).

### Phase 2: Remove Deprecated Endpoint
- **REMOVED**: `POST /register/create-user` endpoint. Use `POST /system/create-user` instead.

### Phase 3: Remove `streamId` (singular) Backward Compatibility
- **REMOVED**: Events no longer return `streamId` (singular). Only `streamIds` (array) is returned.
- **REMOVED**: Event creation/update no longer accepts `streamId`. Use `streamIds: [...]` instead.

### Phase 4: Remove Tags Backward Compatibility
- **REMOVED**: `tags` property on events (input and output). Tags were previously converted to prefixed streamIds.
- **REMOVED**: `tags` query parameter for events.get.
- **REMOVED**: Tag-based access permissions (`{ tag: ..., level: ... }`).

### Phase 5: Final Cleanup
- **REMOVED**: `/service/infos` endpoint (use `/service/info` instead).

## Phase 5b: Remove FollowedSlices

- **REMOVED**: FollowedSlices feature — API methods (`followedSlices.create`, `followedSlices.get`, `followedSlices.delete`), routes, and storage backends have been fully removed.
