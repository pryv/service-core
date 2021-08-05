# Synopsis

Pryv core server app components, ie. what runs on each server node and handles user data.


# Usage

## Install

_Prerequisites:_ 
- Node v12
- Yarn v1
- Mongo DB v3.6 (needs at least 4GB of free disk space for the initial database)
- InfluxDB v1.2
- nats-server
- graphicsmagick - for image events preview
- make

For node, you may use [nvm](https://github.com/nvm-sh/nvm) or [nodenv](https://github.com/nodenv/nodenv) to manage multiple nodeJS versions.

###### On a mac OS X system
You should be able to install these prerequisites by first installing homebrew and then running these commands: 

~~~bash
$ brew install nats-server node-build influxdb nodenv/nvm
# Follow post-install instructions by homebrew, especially for nodenv/nvm.
$ nodenv install 8.8.0
$ brew install graphicsmagick
~~~

You will need to install 'node-gyp' globally as well: `yarn global add node-gyp`. Your environment needs to support C/C++ compilation. On Linux, this includes `sudo apt-get install build-essentials`, on Mac OS X this is XCode + Command Line Utilities.

###### On Ubuntu 18.04: 
```
sudo apt-get install build-essential influxdb graphicsmagick

# Install nats-server
./scripts/setup-nats-server.sh

# Start nats-server in the background
nats-server/nats-server-v2.3.4-linux-amd64/nats-server &

# Start Influxdb 
sudo service influxd start
(you can check the status with sudo service influxd status)

# Installs MongoDB in the parent folder and run yarn install
./scripts/setup-dev-env.bash

# Start Mongodb in the background
yarn database

# For local development (Optional)
npm install -g nodemon

```

Then just `yarn setup`. **Warning** don't use `yarn install`; now using --no opts because they don't compile.

## Top Level Directories

    .
    ├── CHANGELOG.md        Changelog
    ├── Jenkinsfile          Used by Jenkins to identify and run the build
    ├── README.md           This README
    ├── build               Contains files needed for Docker release build
    ├── components          Source code for all components 
    ├── custom-extensions   Custom auth steps, during tests mainly.
    ├── decls               Flow-Type annotations, managed by us
    ├── dist                Once you run 'yarn release', this is created
    ├── docs                Documentation in Markdown format 
    ├── flow-typed           Flow-Type annotations, managed by flow-typed
    ├── node_modules        Package installation, `yarn install`
    ├── package.json        Yarn package file
    ├── proxy               Proxy configuration
    ├── scripts             Scripts used to manage the repository
    ├── test                Top-Level Tests for Integration tests.
    └── yarn.lock           Lockfile for Yarn, locks down dependencies versions.

## How to?

| Task                              | Command                        |
| --------------------------------- | ------------------------------ |
| Setup                             | `yarn install`                 |
| Create Distribution for release  | `yarn release`                 |
| Create Dev. Distribution (with source Maps) | `yarn build-dev`               |
| Recompile During Development      | `yarn watch`                   |
| Run Tests                         | `yarn test`                    |
| Produce coverage html | `yarn cover` |
| Run Integration Tests             | `yarn test-root`               |
| Run API server                    | `yarn api`                     |
| Run Preview server                | `yarn previews`                |
| Run Webhooks service              | `yarn webhooks`                |
| Run Database                      | `yarn database`                |
| DB migration process | `cd dist/components/api-server/ ; ./bin/migrate` |
| Get a list of available processes | `cat Procfile`                  |
| Run flow checker                   | `watch -c flow --color=always`  |

**NOTE** that all binaries like `flow` must be accessed by prepending `yarn {flow}`.

## Setup

### Flowtype transpilation

**First execution**: Run at least once `yarn release` or `yarn build-dev` before running the servers or tests. The source code needs to be transpiled from Flowtype to pure JS.

During development, use `yarn watch` to recompile all files after each saved change. Look out for compilation errors that might prevent the distribution from being updated.

### MongoDB

`./scripts/setup-dev-env.bash` installs MongoDB in the parent folder and runs `yarn install`.

## Test Running

_Prerequisite:_ MongoDB must be running on the default port; you can use `yarn database`.

`yarn test` runs tests on each component. See individual components for things like detailed output and other options.
`yarn test-root` runs root tests combining multiple components (e.g., High-Frequency series).

If you want to run tests for a specific component, you can run them against the transpiled files by going into `dist/components/${COMPONENT_NAME}` then running `yarn test` there.

If you want to run tests directly against the source files in `components/`, you will need to start with a command like this: 

```shell
$ NODE_ENV=test ../../node_modules/.bin/mocha --timeout 10000 'test/**/*test.js' --exit --grep="whatever"
```

This is something that should probably be a shell alias in your environment. I use 

```shell
$ alias pm="NODE_ENV=test ../../node_modules/.bin/mocha --timeout 10000 'test/**/*test.js' --exit"
```

#### Control Output during tests

- Show debug information with `DEBUG="*"` env var.
- Display spawn instances of server with `LOGS=<level>` env var. `info` , `warn`, `error` 



### VsCode

#### Tools and settings

- [Source maps navigator](https://marketplace.visualstudio.com/items?itemName=vlkoti.vscode-sourcemaps-navigator) navigate to the original source code directly from transpiled/generated one. Use `Ctrl/Cmd+click` on links

#### Debug

Launch `yarn watch`

Open terminal in VsCode (Terminal => New terminal)

`cd dist/component/api-server`

Add your breakpoints 

`yarn test-debug`

### Debug tests by hand

- print server 500 errors: uncomment line containing `uncomment to log 500 errors on test running using InstanceManager`
- print server console.log: uncomment line with `stdio: 'inherit'`

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

It is possible to extend the API and previews servers with your own code, via the configuration keys defined under `customExtensions`:

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

## Test IDs tagging

To tag test cases with IDs run: `yarn tag-tests`. Please use check in [test-results](https://github.com/pryv/test-results-pryv.io) for possible duplicates.

## Test Results

Test results are kept in the [test-results-pryv.io](https://github.com/pryv/test-results-pryv.io) repository.

- Checkout the repository locally: `yarn init-test-results-repo`
- Run the test suite, printing the results in `test_results/service-core/${TAG_VERSION}/${TIMESTAMP}-service-core.json` using: `yarn output-test-results`
- Upload the results: `yarn upload-test-results`

## Troubleshooting

### Test failures

If you're running into a lot of test failures because mongoDB doesn't like you today, it's maybe because your database is empty so try to run the storage tests first:

    $ cd dist/components/storage/ && yarn test

If you are getting multiple seamingly unrelated errors following a branch switch, rebuild the `dist/` folder using `rm -rf dist/ && yarn release`.

### Cannot find module components

When running tests in single components:
- `Error: Cannot find module 'components/...'`: Ensure that symlink `node_modules/components` pointing to `../components` exists. (for `dist/`, `yarn release` takes care of it).

### Unicode

If you're blocking because 'unicode.org' doesn't like you today, here's what you do:

    $ NODE_UNICODETABLE_UNICODEDATA_TXT=$(pwd)/UnicodeData.txt yarn install

### Docker installation on Linux

If you are trying to run `docker SOME_COMMAND` and get the following error:  

```log
docker: Got permission denied while trying to connect to the Docker daemon socket at unix:///var/run/docker.sock: Post http://%2Fvar%2Frun%2Fdocker.sock/v1.26/containers/create: dial unix /var/run/docker.sock: connect: permission denied.
See 'docker run --help'.
```

You should add the current user to the `docker` group: `sudo usermod -a -G docker $USER`  

After running this command, in your shell, log out of your account and log back in, reboot if needed.  
Run `docker run hello-world` to check if it works.

[reference](https://techoverflow.net/2017/03/01/solving-docker-permission-denied-while-trying-to-connect-to-the-docker-daemon-socket/)

### Influxd "too many open files" error

Delete your local influx DB files and reboot Influx DB:

```
rm ~/.influxdb/data/*
influxd
```

Or increase the number of authorized files using: `ulimit -n 1024` (or more if needed)

# License
Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
Unauthorized copying of this file, via any medium is strictly prohibited
Proprietary and confidential