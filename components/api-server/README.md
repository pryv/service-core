# Pryv API server

Node.js / Express server to manage user activity and user administration requests.


## Setting up the development environment on a Mac

**Preliminary step**: if you'll be working on the [common API server module](https://github.com/pryv/api-server-common) too, clone it somewhere and link it with NPM:

```bash
# from api-server root directory
npm link <api-server-common working copy path>
```

Read, then execute `./scripts/setup-dev-environment.bash`. It will check for Mongo DB in the parent folder and install it if necessary

Note: MongoDB needs at least 4GB for its initial database.

### About event types definitions

The server tries to validates incoming event data for known types.
The default source for event types definitions is in `schema/default-event-types.json`, and this file
must be kept up-to-date by running `scripts/update-defaut-event-types.bash`, which fetches the "official"
version published online.
(The server also tries to update this asynchronously at startup but fallbacks to the default definitions
in the meantime and if the online version is unavailable or corrupted.)


## Starting up Mongo DB

`./scripts/start-database.sh` in a separate terminal tab/window.


## Running the tests

- `make` (or `make test`) for quiet output
- `make test-detailed` for detailed test specs and debug log output
- `make test-profile` for profiling the tested server instance and opening the processed output with `tick-processor`
- `make test-coverage` for generating and opening coverage stats (with Blanket.js)
- `make test-debug` is similar as `make test-detailed` but in debug mode (see 'Debugging' below)

Note that acceptance tests covering the API methods use the HTTP API (that was implemented first); acceptance tests using Socket.IO only cover socket-specific functionality, not API commands.


## Debugging

- `make test-debug` (see above) to attach your debugger of choice
- `./scripts/inspector-debug-tests.sh` to use *node-inspector*, opening it in the default browser. (*node-inspector* requires a Webkit browser.)


## Deploying

As the server has a dependency on [api-server-common](https://github.com/pryv/api-server-common) (a private GitHub repo) we must ensure the deploying user's SSH key on the target machine is authorized for accessing the repo on GitHub.

### Deploying

**Preliminary**: setup Git remotes for production and staging targets (in `.git/config`):

```
[remote "staging"]
  fetch = +refs/heads/*:refs/remotes/stage/*
  url = git@sthead.pryv.net:~/repos/api-server
[remote "production"]
  fetch = +refs/heads/*:refs/remotes/prod/*
  url = git@head.pryv.net:~/repos/api-server
```

To deploy (`{target}` is either `staging` or `production`):

1. Make sure the version to deploy is properly tagged (`v{major}.{minor}.{revision}`)
2. `git checkout {target}`
3. `git merge {version tag}`
4. `git push {target} {target}`
5. `git push origin {target}` to keep origin up-to-date

(Note: your Git SSH key must be authorized for deployment.)


## Folder structure

- `scripts` contains environment setup and other dev utility scripts
- `source` contains the code
	- `errors`: common error declarations
	- `methods`: implementation of the API's methods, called by either the HTTP routes or the Socket.IO event handlers
	- `middleware`: custom Express middleware
	- `routes`: HTTP route definitions
	- `schema`: JSON schema definitions for validating exchanged data
	- `sockets`: Socket.IO init and event definitions
	- `utils`: common utils
- `test`: Mocha tests
	- `acceptance`: integration tests covering the functional side of the API
	- other folders contain unit tests
- `test-support`: miscellaneous helpers used in tests


## Coding conventions

Coding conventions are [there](https://github.com/pryv/guidelines/).
