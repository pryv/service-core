## 1.8

### 1.8.1 
- Fix migration 1.6.x to 1.8.0 bug

### 1.8.0

- Add support for password rules: complexity, age, reuse; see API server's `auth.password*` settings
  - Affected methods are: create user (`POST /users`), change password (`{user endpoint}/account/change-password`), reset password (`{user endpoint}/account/reset-password`) and login (`{user endpoint}/auth/login`)
- Add undocumented support for external stores (a.k.a. "data mapping" feature); see component `pryv-datastore` (will be published separately when appropriate)

## 1.7

### 1.7.14
- Fix crash caused by permissions selfRevoke used in combinaison with BACKWARD_COMPATIBILITY_SYSTEM_STREAMS_PREFIX set to true.
- Fix issue with `accesses.create` theand selfRevoke permissions that was only possible with a personalToken.

### 1.7.13

- Fix another issue when BACKWARD_COMPATIBILITY_SYSTEM_STREAMS_PREFIX is set to "true" - children streams' ids were not following the correct format
- Fix a performance issue when querying events by type
- Fix an issue which caused the service not to restart properly in some situations

### 1.7.12

- Fix issue when BACKWARD_COMPATIBILITY_SYSTEM_STREAMS_PREFIX is set to "true" - "account" streamId was handled as ".account"

### 1.7.10

- API change: Don't coerce event content and simplify known type validation process in api-server
- serviceInfo:eventTypes URL now supports `file://` protocol allowing it to load definition from file system

### 1.7.9

- Fix issue with events.getAttachment making core crash if filename contained fancy characters by putting it in the 'Content-disposition' header
- Security fix: make password reset token single-use
- Security fix: hide "newPassword" in logs when an error occurs in account.resetPassword

### 1.7.7

- Fix issue where a deleted user was kept in the cache, thus rendering the reuse of username possible, but failing all subsequent calls as the password and tokens were not returned (since the wrong userId was returned by the cache)
- Fix issue where attempting to create streams with id 'size' would return an error
- Fix socket.io CORS issue

### 1.7.6

- Fix access-info permissions

### 1.7.5

- add missing system stream permissions accesses
- change __unique properties cleanup, just match them by key suffix, not from current serializer unique props. Avoids migration error if uniqueness has been modified.

### 1.7.3

- fix nats booting after migration

### 1.7.1

- migrate tags into streams

### 1.7.0

- introduce mall abstraction
- add integrity
- refactor access permissions logic

## 1.6

### 1.6.21

Fixes:

- fix boolean/bool event type that was not allowed
- fix HF null values for optional values that was not fully working

Changes:

- increase username characters limit to 60

### 1.6.20

- Implement system route to deactivate MFA

### 1.6.18

- Fix welcome email: don't wait for welcome email sending before replying to client.

### 1.6.16

- Fix versioning: update unique system events bug

### 1.6.15

- Fix user deletion

### 1.6.14

- personal token can delete an account
- add external licenser: pryv/app-node-licenser
- fix security issue with users registration conflicts leaking random email addresses

### 1.6.13

- Unify configuration into boiler
- Fixes for Open Pryv.io

### 1.6.12

Fixes:

- versioning now works when trashing event

### 1.6.7

New Features:

- Stream queries for events.get

Fixes:

- usernames starting with "system" are available
- personal token expiration now fixed
- Users create call on core username error message now specifies that letters must be lowercase

Changes:

- In configuration, rename "singleNode" to "dnsLess", keeping retro-compatibility for "singleNode" with warning message

Removals:

- Deprecated "GET /who-am-i" API method removed
- Remove pryvuser-cli code (the image was not built since July)

### 1.6.3

Custom Auth function now has access to all headers.

### 1.6.2

- Fix migration that was skipping passwordHash leading to users not being able to login
- add errors if this cases arises

### 1.6.1

Fixes for dnsLess/openSource:

- /reg/service/info
- dependencies
- boost POST payload to 10MB for HF server

### 1.6.0

system streams:

- customizable (& extendable) unique and indexed account properties
- access to account properties through the events API with its access management
- user account deletion through administration API

## 1.5

### 1.5.23-4

- Bump bcrypt from 3.0.8 to 5.0.0
- Remove it from components/utils as it is in root package.json

### 1.5.22

- fix deleting app access deletes shared accesses it created

### 1.5.21

- make event types call with header 'User-Agent: Pryv.io/{API version}

### 1.5.20

- fix missing API version

### 1.5.19

- fix readTokens for shared accesses

### 1.5.18

- add username to access-info

### 1.5.16-17

- fix socket.io for dns-less

### 1.5.14-15

- fix airbrake

### 1.5.10-13

- load reporting lib conditionnally

### 1.5.9

- use lib-reporting:
  - requires reporting:licenseName to boot api-server
  - not used in open-source mode
- create user on open-source register now returns pryvApiEndpoint

### 1.5.8

- Added compatibility for open-source version with DNS-less capabilities
- upgrade socket.io from v0.9 to v2

### 1.5.7

- Update babel to v7, now compiling into node v12 (instead of v8)
- Update airbrake version
- Silence serviceInfo log for tests

### 1.5.6

- Extend Webhooks manipulation to shared accesses.
- Extend Socket.io interface to shared accesses.
- Extend Socket.io interface to accesses containing a `create-only` permission.

### 1.5.5

- Add new access permission class: `{ feature: "selfRevoke", setting: "forbidden"}` which explicitely forbids accesses to self revoke.

### 1.5.4

- Updating access via `accesses.update` has been removed.
- Capacity for an access to self revoke with `accesses.delete <id>` has been extended to `shared`tokens.

## 1.4

### 1.4.34

 - Fix webhooks reactivation

### 1.4.33
 - Optimize batch calls to only reload streams in case of possible change in structure
 - multiple fixes to make 1.4.32 work (config)

### 1.4.32
 Refactor: How service-info is used in core
  - service-info can be loaded from file for dev
  - eventTypes are loaded from service-info
  - crash if no service-info

### 1.4.31
 - Feature: create-only level for permissions

### 1.4.27
 - Feature : add reporting to startup

### 1.4.26

 - Fix #186 : Add 'readToken' to events.getOne attachments
 - Fix #208 : Forbid to convert standard event to HFS (and vice-versa)
 - Fix #210 : HFS now support basic auth
 - Fix #212 : Add Meta to HFS response.
 - Fix #222 : Add Meta to batch response.

### 1.4.25

 - Fix preview-server module loading issue.

### 1.4.24

 - Update node to 12.13.1.

### 1.4.23

 - Enrich access-info call result with more access properties.

### 1.4.22

 - Fix: Accesses.get gives inexact result when accesses have permissions on unexisting/deleted streams.

### 1.4.21

 - Throw consistent errors for trashed HF events.

### 1.4.20

 - Various fixes for HF series:
   - Fix validation for events.create and events.update
   - Add nats:uri to configuration

### 1.4.19

 - Implement delete and update methods for HF series.

### 1.4.18

 - Plug airbrake for webhooks server and improve general error reporting strategy

### 1.4.17

 - Fix bug with batch streams.create calls not working for non-"star" permissions

### 1.4.16

New feature:

 - Pryv.io API now support the Basic Authentication scheme

### 1.4.15

- Official release of webhooks

### 1.4.14

- Preview release of webhooks

### 1.4.13

- Fix config loading in pryv-cli

### 1.4.12

- Add route /service/info who provides a unified way for third party services to access the necessary information related to a Pryv.io platform.

### 1.4.11

- Fix pryv-cli user-delete so that it works for single-node setups and prevent it to abort if the username is already deleted on register.

### 1.4.10

- Most API calls now present a 'Pryv-Access-Id' response header that contains the id of the access used for the call. This is the case only when a valid authorization token has been provided during the request (even if the token is expired).

### 1.4.9

- Improve the update account API call, in particular when it applies a change of email address. It now correctly checks if the email address is not already in use before updating the account and throws consistent errors.

### 1.4.6

- Increase MongoDB driver reconnection window.

### 1.4.5

- Refactor mongo duplicates management into storage layer.

### 1.4.4

- Events, Streams, Accesses, Profiles and FollowedSlices are now stored in single collections on MongoDB. This results in smaller per-user RAM usage.

## 1.3.X

- High Frequency events allow storing data at high frequency and high data
  density. Create them by using types that start with 'series:X', where X
  is a normal Pryv type. The API also supports inputting data into multiple
  series at once, this is called a 'seriesBatch' (POST /series/batch).

- The api is internally using multiple processes to offload request handling
  and json serialisation. This should allow much higher request rates, but your
  mileage may vary. Storage IOPS matter.

- Some invalid requests that used to return a HTTP status code of 401
  (Unauthorized) now return a 403 (Forbidden). Only the requests that are
  missing some form of authentication will return a 401 code.

- `updates.ignoreProtectedFields` is now off by default. This means that updates
  that address protected fields will result in an error being returned.

- Accesses can now be set to expire via the `expireAfter` attribute. Expiry for
  accesses gives you an easy way of limiting the damage that can be done using
  a stolen access.

- We've rehauled the 'delete-user' command of the Pryv.IO cli admin tool. It
  now operates more explicitly and allows automation.

- Improvements related to MongoDB:
  - We now use j:true as write concern, which requests acknowledgement that
    write operations has been written to the journal. This measure improves our
    persistence story in the face of a crash.
  - Implement user pool to anticipate users creation burst through two new API routes:
    POST 'system/pool/create-user' and GET 'system/pool/size'.
  - Make nightly tasks manually triggereable by sysadmins.

- Critical Security Fixes:

  - 2018022101, 2018022102: Fixes to DNS server closing minor vulnerabilities:
      DNS could be - under certain circumstances - used to exploit other systems.

  - 2018091401: Fixes to the password reset mechanism; a bug would allow an
      attacker to change passwords under certain circumstances.

  - 2018102401: Details will be disclosed after Dec/18

- Implement fetch deleted accesses using `includeDeletions` in accesses.get API method

- Add clientData field to Accesses and create/update methods

- Fix a bug which prevented accesses with root ("streamId":"*") permission from managing sub-accesses correctly

- Remove some chown -R commands in our boot scripts, since it had the effect of delaying the start of the core node processes, for example if the data folder contains a lot of files (attachments). From now on, the recommendation is to run these commands independently in a sanitization script when installing or updating of the platform.

- Add `httpOnly` flag to server-side cookie sent in response to successful `/auth/login` request.

- Refactor mongo duplicates management into storage layer and make the related checks consistent among all the api-server methods.

## 1.2.X

- Fix login with Firefox (and other browsers using Referer but no Origin)

- Security fix 2018020801: 'accesses.update' was missing an authorisation check.

- Update of the API version in API responses

- Blacklist usage errors from airbrake

- Fix events.get JSON formatting bug when retrieving ArraySize+1 events

- Improve tests stability: fix environment variable NODE_ENV

- Add configuration options to disable resetPassword and welcome emails

- Add configuration option to ignore updates of read-only fields

- Updates to latest nodejs version as a reaction to advisory
  https://nodejs.org/en/blog/vulnerability/oct-2017-dos/

- Security fixes to various parts of Pryv: Now doesn't log passwords or password
  hashes as part of normal operation.

- Please see Migration Guide for implications on your infrastructure.

- Tags have a maximum length of 500 characters. An error is returned from the
  API when this limit is exceeded.

- When two users would log in at almost the same time, we had a insert/update
  data race. This should be fixed now.

- Instead of blacklisting the fields that the user cannot update, we now
  whitelist those that he can.

## v0.8.x

Changes:

- Deletion methods now:
    - Reply to permanent deletions with a `{item}Deletion` field confirming the
      deleted item's identifier
    - Always return code 200 on HTTP (that's a rollback of the v0.7.x change
      which was a bit too zealous to be practical)

New features:

- Event and stream deletions are now kept for sync purposes; they're accessible
  via parameter `includeDeletions` (`events.get`) or `includeDeletionsSince`
  (`streams.get`). Deletions are cleaned up after some time (currently a year).


## v0.7.x

Major changes here towards more standardization and flexibility:

- All JSON responses (both in HTTP and Socket.IO) are now structured as follows:
    - `{ "{resource}": {...} }` if a single resource item is expected; for
      example: `{ "event": {...} }`, `{ "error": {...} }`
    - `{ "{resources}": [ {...}, ... ] }` if an indeterminate number of items
      is expected; for example: `{ "events": [ {...}, ... ] }`

- All responses to resource creation and update calls now include the full
  object instead of respectively its id and nothing; for example: `{ "stream":
  {...} }`

- All JSON responses now include `meta.apiVersion` and `meta.serverTime`
  properties mirroring the original `API-Version` and `Server-Time` HTTP
  headers; HTTP header `API-Version` remains

- Deleting a resource now returns code 204 if the item was permanently deleted;
  it still returns a 200 when trashed (now including the trashed item in the
  response)

- Method ids for deletion/trashing are now `{resource}.delete` instead of
  `{resource}.del`
- The `attachments` property of events is now an array (instead of an object),
  with each attachment now identified by a new `id` property (instead of
  `fileName`)

- As a security measure, reading attached files now either requires auth via
  the `Authorization` HTTP header or a new `readToken` query string parameter
  (`auth` isn't allowed anymore in this case); the token to use is specific to
  each file and access, and is defined in the `readToken` property of each
  event attachment

- Event batch creation method has been replaced with generic batch method
  (`callBatch`, HTTP: `POST /`)

- Bookmarks have been renamed to "followed slices", corresponding method ids to
  `followedSlices.*` and HTTP routes to `/followed-slices`

- Getting events: setting the `tags` parameter now returns events with *any* of
  the specified tags, instead of *all* of them

- Error ids:
  - `unknown-*` errors replaced with either `unknown-resource` or
    `unknown-referenced-resource`
  - `item-*-already-exists` replaced with `item-already-exists`
  - `missing-parameter` replaced with `invalid-parameters-format`

- Other improvements and fixes (data validation performance, minor bugs on auth
  for trusted apps)

New features:

- Getting events: filter for specific event types with the `types` parameter

- Accesses can now define tag permissions in `permissions` (in addition to the
  existing stream permissions)

  - If only tag permissions are set, all streams are considered readable, and
    vice-versa
  - When stream and tag permissions conflict, the highest permission level is
    considered

- Full support for managing account information, including password change and
  reset


## v0.6.x

Changes to HTTP paths and auth for trusted apps:

- Get streams: removed `trashed` option for `state` as it was more trouble than
  anything useful

- Accesses now includes property `id` (exposed for referencing)
    - Create access response now includes both `id` and `token` properties
    - For existing accesses, `id` and `token` are equal

- Events, streams and accesses now includes change tracking properties:
    - `created` and `modified` (timestamp)
    - `createdBy` and `modifiedBy` (access id or `"system"`)

- Socket.IO method calls now directly use method ids (e.g. `events.create`  and
  pass method params, instead of using `command` and passing an object with
  method id and params

- For trusted apps only: removed the distinction between "admin" methods and
  others; (**breaking changes**)

  - `/admin/login`, `/admin/logout` and `/admin/who-am-i` moved to
    `/auth/login`, `/auth/logout` and `/auth/who-am-i` respectively
  - `sessionID` renamed to `token` in login response and SSO cookie data
  - *Personal* accesses are now automatically created on login; they can't be
    created explicitly anymore
  - `/admin/user-info` moved to `/user-info`
  - `/admin/accesses` merged into `/accesses`
  - `/admin/bookmarks` moved to `/bookmarks`
  - `/admin/profile` merged into `/profile`

- Configuration: renamed `clients` section to `auth` and added SSO and session
  settings

- Updated Node.js version to 0.10.23

- Removed dependency on ZeroMQ (replaced by pure Node.js lib)


## v0.5.2

This is a major update that will break most libs and clients, which should be
updated ASAP.

- Simplified the API by removing channels and renamed folders into "streams";
  adjusted the structure of accesses, streams and events accordingly; more
  details:

  - As a consequence, every event now belongs to a stream
  - Data migration: former channels will be converted into root-level streams,
    and former folders into sub-streams of those

- Events structure:
  - `event.type` is now a string of format `{class}/{format}` (e.g.
    `picture/attached`) instead of an object with `class` and `format`
    properties
  - `event.value` has been renamed to `event.content`

- Get events:
  - Renamed parameter `onlyFolders` to just `streams`
  - Added `running` boolean parameter, replacing "get running periods" method

- Removed "get running periods" (i.e. `GET /events/running`, see above)

- Removed `hidden` property of streams (ex-folders), which was mostly unused
  and out of place


## v0.4.16

- New feature: Allow HTTP method overriding by POSTing _method, _json, and _auth
  parameters in an URL-encoded request

- Improvement: Retrieving events for a specific timeframe now includes all
  events that overlap that timeframe, including period events that started
  earlier


## v0.4.13

- Added event type validation: the API will now check if an event being created
  or updated has a known type (as listed on our event types directory), and if
  yes perform data validation on its value (returning a 400 error if invalid)


## v0.4.6

- All error ids have been changed to use `slug-style` instead of
  `C_CONSTANT_STYLE` (so that e.g. `INVALID_PARAMETERS_FORMAT` is now
  `invalid-parameters-format`); this is consistent with the other ids we’re
  using in the system


## About earlier versions

Versions earlier than v0.4 are not covered here.
