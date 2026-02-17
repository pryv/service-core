# Changelog - API Changes

## Remove Deprecated Features (Phase 2)

### Phase 1: Remove Stream ID Prefix Backward Compatibility
- **REMOVED**: The old dot-prefix (`.`) notation for system stream IDs is no longer accepted or returned. Use the standard prefixes (`:_system:` for private, `:system:` for custom) exclusively.
- **REMOVED**: The `disable-backward-compatibility-prefix` HTTP header is no longer supported (no longer needed since prefix conversion is removed).
