# service-core

Pryv.io core server app components, i.e. what runs on each server node and handles user data.


## Installation

Prerequisites:
- `make` and support for C/C++ compilation
  - Linux: e.g. `sudo apt-get install build-essentials`
  - MacOS: e.g. `xcode-select --install` (installs command line tools)
- [Node.js](https://nodejs.org/en/download/) 16
  - Use [nvm](https://github.com/nvm-sh/nvm), [nodenv](https://github.com/nodenv/nodenv) or [n](https://github.com/tj/n) to manage multiple versions
- Mongo DB 4.2 (needs at least 4GB of free disk space for the initial database)
  - MacOS & Linux: already included in `scripts/setup-dev-env`
- InfluxDB 1.2
  - Linux: `scripts/setup-influx`
  - MacOS: e.g. `brew install influxdb`
- nats-server
  - Linux: `scripts/setup-nats-server`
  - MacOS: e.g. `brew install nats-server`
- graphicsmagick (for image events preview)
  - Linux: e.g. `sudo apt-get install graphicsmagick`
  - MacOS: e.g. `brew install graphicsmagick`
- [just](https://github.com/casey/just#installation)

Then:
1. `just setup-dev-env` to setup local file structure and install MongoDB
2. `just install [--no-optional]` to install node modules
3. `just compile-dev` for the initial code compilation into `dist`


## Dev environment basics

The project is structured as a monorepo with components (a.k.a. workspaces in NPM), each component defining its `package.json`, tests, configs, etc. in `components/<name>`.

Scripts are run via `just <command> [params]`. Running `just` displays the commands defined in `justfile`, which should cover all usual needs. (Typical usage examples are included throughout this document.)

Everything should be accessible from the project root, including running commands on a particular component (typically via `just <command> <component> ...`). We keep things consistent across components, with as much as possible defined at the root level. In particular:
- All NPM dependencies are kept in the root `package.json`
- No NPM scripts anything other than basic properties are kept in components' `package.json`


## Flowtype transpilation

Run at least once `just compile-release` or `just compile-dev` before running the servers or tests. The source code needs to be transpiled from Flowtype to pure JS. The compiled code is in `dist`.

During development, use `just compile-watch` to recompile all files after each saved change. Look out for compilation errors that might prevent the distribution from being updated.


## Service dependencies

The servers and tests depend on NATS server, MongoDB and InfluxDB. `just start-deps` to have them all running at once.


## Testing

`just test <component> […params]`:
- `component` is an existing component's name, or `all` to run tests on all components
- Extra parameters at the end are passed on to [Mocha](https://mochajs.org/)
- Replace `test` with `test-detailed`, `test-debug`, `test-cover` for common presets

For example:
- `just test all` tests all components using default settings
- `just test-detailed api-server --bail` tests component `api-server` with detailed output, stopping on the first test failure

### Useful Mocha parameters

See [the Mocha docs](https://mochajs.org/#command-line-usage) for the full reference:
- `--bail` stops on the first test failure
- `--grep <text>` only runs tests matching the given text (typically used with test ids, see below)

### Control console output during tests

By setting env variables:
- `LOGS=<level>` to show spawned server instances output (level: `info`, `warn`, `error`)
- `DEBUG="*"` to show debug information

### Test ids tagging

Every test case is tagged with a unique id for unambiguous reference. `just tag-tests` to tag yet-untagged cases, then please use the check in [test-results](https://github.com/pryv/dev-pryv.io-test-results) for possible duplicates.

### Test results

Test results are kept in the [dev-pryv.io-test-results](https://github.com/pryv/dev-pryv.io-test-results) repository and published on the dev site.
- `just test-results-init-repo` to checkout the repository locally
- `just test-results-generate` to run the test suite and save the results to `test_results/service-core/${TAG_VERSION}/${TIMESTAMP}-service-core.json`
- `just test-results-upload` to upload the results


## Debugging

Add your breakpoints _in the compiled code_ (i.e. in `dist`), then `just test-debug` to run tests in debug mode.

For debugging by hand, old-school:
- Print server 500 errors: uncomment the line containing `uncomment to log 500 errors on test running using InstanceManager` in `…/errorHandling.js`
- Print server `console.log`: uncomment the line with `stdio: 'inherit'` in `…/InstanceManager.js`

Miscellaneous tools:
- VSCode extension [Source maps navigator](https://marketplace.visualstudio.com/items?itemName=vlkoti.vscode-sourcemaps-navigator) helps navigate to the original source code from the compiled one. Use `Ctrl/Cmd+click` on links.


## Tracing

`just trace` to start the tracing service (Jaeger).


## Data migration

`just run api-server migrate` triggers data migration. Migrations are defined in the `storage` component.


## App Configuration

Components supporting configuration load their settings from (last takes precedence):

1. Default values, as defined in the [base configuration](https://github.com/pryv/service-core/blob/master/components/utils/src/config.js#L20) or the component's own
2. A JSON file specified by setting `config`, defaulting to `config/{env}.json` (`env` can be `production`, `development` or `test`); typically used for per-environment settings. This variant is deprecated and will be faded out.
3. An additional "overrides" JSON file specified by setting 'configOverrides'; typically used for confidential settings (e.g. keys, secrets). This variant is deprecated and will be faded out.
4. Environment variables; default naming scheme: `PRYV_SETTING_KEY_PATH` (for example, `PRYV_DATABASE_HOST` for `database`→`host`). This variant is deprecated and will be faded out.
5. Command-line options as `--key=value`; default naming scheme: `setting:key:path` (for example, `database:host` for `database`→`host`). This variant is deprecated and will be faded out.

To specify a configuration file, please use `--config` with a relative or absolute path. This will be the way to configure Pryv.io for the near future.

Those components also accept the following command line options:

- `--help` displays all available configuration settings as a schema structure (and exits)
- `--printConfig` prints the configuration settings actually loaded (e.g. for debugging purposes)


## Customizing server behaviour

It is possible to extend the API and previews servers with custom code, via the configuration keys defined under `customExtensions`:

- `defaultFolder`: The folder in which custom extension modules are searched for by default. Unless defined by its specific setting (see other settings in `customExtensions`), each module is loaded from there by its default name (e.g. `customAuthStepFn.js`), or ignored if missing. Defaults to `{app root}/custom-extensions`.
- `customAuthStepFn`: A Node module identifier (e.g. `/custom/auth/function.js`) implementing a custom auth step (such as authenticating the caller id against an external service). The function is passed the method context, which it can alter, and a callback to be called with either no argument (success) or an error (failure). If this setting is not empty and the specified module cannot be loaded as a function, server startup will fail. Undefined by default.

    ```javascript
    // Example of customAuthStepFn.js
    module.exports = function (context, callback) {
      // do whatever is needed here (check LDAP, custom DB, etc.)
      doCustomParsingAndValidating(context, function (err, parsedCallerId) {
        if (err) { return callback(err); }
        context.originalCallerId = context.callerId;
        context.callerId = parsedCallerId;
        callback();
      });
    };
    ```

    Available context properties (as of now):

    - `username` (string)
    - `user` (object): the user object (properties include `id`)
    - `accessToken` (string): as read in the `Authorization` header or `auth` parameter
    - `callerId` (string): optional additional id passed after `accessToken` in auth after a separating space (auth format is thus `<access-token>[ <caller-id>]`)
    - `access` (object): the access object (see [API doc](https://api.pryv.com/reference/#access) for structure)


## About event types definitions

The default event types definitions (`components/business/src/types/event-types.default.json`) must be kept up-to-date with `just update-event-types`, which fetches the "reference" version published online. (The server also tries to update this asynchronously at startup but fallbacks to the default definitions in the meantime and if the online version is unavailable or corrupted.)


## Troubleshooting

### Test failures

If you're running into a lot of test failures because MongoDB doesn't like you today, it's maybe because your database is empty so try to run the storage tests first:

    $ cd dist/components/storage/ && npm test

If you are getting multiple seemingly unrelated errors following a branch switch, rebuild the `dist/` folder using `rm -rf dist/ && just compile-release`.

### Docker installation on Linux

If you are trying to run `docker <some command>` and getting the following error:

```log
docker: Got permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock: Post http://%2Fvar%2Frun%2Fdocker.sock/v1.26/containers/create: dial unix /var/run/docker.sock: connect: permission denied.
See 'docker run --help'.
```

You should add the current user to the `docker` group: `sudo usermod -a -G docker $USER`

After running this command, in your shell, log out of your account and log back in, reboot if needed.
Run `docker run hello-world` to check if it works.

([Reference](https://techoverflow.net/2017/03/01/solving-docker-permission-denied-while-trying-to-connect-to-the-docker-daemon-socket/))

### InfluxDB "too many open files" error

Delete your local influx DB files and reboot Influx DB:

```
rm ~/.influxdb/data/*
influxd
```

Or increase the number of authorized files using: `ulimit -n 1024` (or more if needed)


# License
Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
Unauthorized copying of this file, via any medium is strictly prohibited
Proprietary and confidential
