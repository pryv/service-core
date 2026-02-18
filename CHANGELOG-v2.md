# Changelog - API Changes

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
