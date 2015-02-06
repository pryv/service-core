# Pryv API server common library

Common bits for use by both API server and browser server. (For now this is not a stand-alone lib with a dedicated issues list: issues are managed on the dependent repos.)


## CLI for user management

The lib registers a tiny command-line tool `pryvuser` to help manage users on Pryv nodes. Currently the only command implemented is `pryvuser delete <username>`.

`pryvuser --help` gives usage details. The tool expects a config file either to be passed in via `--config [path]` or to be present in `<working directory>/api-server.config.json`.   


## Usage

```javascript
var common = require('pryv-api-server-common');
```

### Contents

- `errors`
  - `APIError`
  - `errorHandling`
  - `ErrorIds`
  - `factory`
- `middleware`
  - `commonHeaders`
  - `errors`
  - `loadAccess`
  - `loadUser`
  - `override`
  - `subdomainToPath`
- `model`
  - `accessLogic`
  - `MethodContext`
- `storage`
  - `Database`
  - `PasswordResetRequests`
  - `Sessions`
  - `Size`
  - `Users`
  - `Versions`
  - `user`
    - `Accesses`
    - `EventFiles`
    - `Events`
    - `FollowedSlices`
    - `Profile`
    - `Streams`
- `utils`
  - `config`
  - `encryption`
  - `logging`
  - `treeUtils`

### Test helpers

The following is also available if the `TEST` environment variable is set:

- `testHelpers`
  - `request`
  - `attachmentsCheck`
  - `data`
  - `dependencies`
  - `InstanceManager`

And/or if `NODE_ENV` is set to `development`:

- `testHelpers`
  - `instanceTestSetup`


## Contributing


### Publishing

Make sure to **tag** every version pushed on the master branch, as dependant apps rely on tag names to pull the correct version.

For example:

```bash
# on master branch, package.json version set to 0.1.0, all changes committed
git push
git tag v0.1.0
git push --tags
```
