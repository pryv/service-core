# Changelog - Internal (no API impact)

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
