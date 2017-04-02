# Pryv core service

Pryv core server app components, ie. what runs on each server node and handles user data.


## Usage

### Install

_Prerequisites:_ Node v6.9.5, Yarn v0.20.3, Mongo DB v2.6+ (needs at least 4GB of free disk space for the initial database), Nginx (optional, skip if you don't need the proxy server).

You will need to install 'node-gyp' globally as well: `yarn global add node-gyp`. Your environment needs to support C/C++ compilation. On Linux, this includes `sudo apt-get install build-essentials`, on Mac OS X this is XCode + Command Line Utilities. 

Then just `yarn install`.

### Top Level Directories

    .
    ├── CHANGELOG.md            Changelog
    ├── Jenkinsfile             Used by Jenkins to identify and run the build
    ├── Procfile                Used by foreman (`nf`) to identify processes 
    ├── README.md               This README
    ├── build                   Contains files needed for Docker release build
    ├── custom-extensions       Custom auth steps, during tests mainly.
    ├── decls                   Flow-Type annotations, managed by us
    ├── dist                    Once you run 'npm run release', this is created
    ├── docs                    Documentation in Markdown format 
    ├── flow-typed              Flow-Type annotations, managed by flow-typed
    ├── jsdoc.json              JSDoc configuration, `npm run jsdoc`
    ├── node_modules            Package installation, `yarn install`
    ├── package.json            Yarn package file
    ├── proxy                   Proxy configuration
    ├── scripts                 Scripts used to manage the repository
    ├── source                  Source code for all components 
    ├── test                    Top-Level Tests for Integration tests.
    └── yarn.lock               Lockfile for Yarn, locks down npm versions.
    
### How to?

| Task                         | Command                        |
| ---------------------------- | ------------------------------ |
| Setup                        | `yarn install`                 |
| Create Distribution          | `yarn run release`             |
| Recompile During Development | `yarn run watch`               |
| Run Tests                    | `yarn run test`                |
| Run Integration Tests        | `yarn run test-root`           |
| Run ALL server proecesses    | `nf start`                     |
| Run API server               | `nf start api`                 |
| Run API and Preview server   | `nf start api, previews`       |
| Run flow checker             | `watch -c flow --color=always` |

Normally, all binaries like `nf` or `flow` must be accessed by prepending `yarn run {nf,flow}`. 

# Test Running

If you want to run tests in `source/`, you will need to start with a command like this: 

    $ ../../node_modules/.bin/mocha \
      --compilers js:babel-register \
      test/**/*.test.js
    
This is something that should probably be a shell alias in your environment. I use 

    $ alias pm="../../node_modules/.bin/mocha --compilers js:babel-register test/**/*.test.js"

### Quick, run the servers

To run the servers, the source code needs to be transpiled from Flowtype to pure JS. Run `yarn run release` at least once to get this done. 

During development, use `yarn run watch` to recompile all files immediately. Look out for compilation errors that might prevent the distribution from being updated. 

To run the processes, use `nf` (javascript foreman), as documented [here](http://strongloop.github.io/node-foreman/).

The proxy runs on `https://{username}.rec.la:8080` (`{username}` can be anything; see [Nginx proxy config below](#nginx-proxy)) and is configured as follows:

- `/api/{path}` proxies for `/{path}` on the API server
- `/previews/{path}` proxies for `/{path}` on the previews server
- `/{path}` serves files from `{static.root}` as defined in the Nginx config

#### Components

Components supporting configuration load their settings from (last takes precedence):

1. Default values, as defined in the [base configuration](https://github.com/pryv/service-core/blob/master/components/utils/src/config.js#L20) or the component's own
2. A JSON file specified by setting `config`, defaulting to `config/{env}.json` (`env` can be `production`, `development` or `test`); typically used for per-environment settings
3. An additional "overrides" JSON file specified by setting 'configOverrides'; typically used for confidential settings (e.g. keys, secrets).
4. Environment variables; default naming scheme: `PRYV_SETTING_KEY_PATH` (for example, `PRYV_DATABASE_HOST` for `database`→`host`)
5. Command-line options as `--key=value`; default naming scheme: `setting:key:path` (for example, `database:host` for `database`→`host`)

Those components also accept the following command line options:

- `--help` displays all available configuration settings as a schema structure (and exits)
- `--printConfig` prints the configuration settings actually loaded (e.g. for debugging purposes)


#### Nginx proxy

The `proxy` folder contains a Nginx configuration template (`nginx.conf.template`) as well as corresponding variables for `development` and `production` in `vars.{environment}.js`. To generate a `nginx.conf`, do `node scripts/compile-proxy-config {variables file}` (this is automatically done for development when running the proxy with `npm run proxy`).

In development, Nginx runs on HTTPS with a "dev" SSL certificate on domain `*.rec.la` (where `*` is whatever Pryv username you like), whose DNS entry points to `127.0.0.1`. This little trick enables HTTPS connections to the local server via wildcard subdomains, without having to rely on additional tools like Dnsmasq.


#### Customizing server behaviour

It is possible to extend the API and previews servers with your own code, via the configuration keys defined under `customExtensions`:

- `defaultFolder`: The folder in which custom extension modules are searched for by default. Unless defined by its specific setting (see other settings in `customExtensions`), each module is loaded from there by its default name (e.g. `customAuthStepFn.js`), or ignored if missing. Defaults to `{app root}/custom-extensions`.
- `customAuthStepFn`: A Node module identifier (e.g. `/custom/auth/function.js`) implementing a custom auth step (such as authenticating the caller id against an external service). The function is passed the method context, which it can alter, and a callback to be called with either no argument (success) or an error (failure). If this setting is not empty and the specified module cannot be loaded as a function, server startup will fail. Undefined by default.

    ```
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


## Contribute

### Setup the dev environment

`./scripts/setup-dev-env.bash` installs MongoDB in the parent folder, sets up your working copy with a JSHint commit hook, and `yarn install`s if needed.

This might be broken right now. Sorry.

### Tests

_Prerequisite:_ MongoDB must be running on the default port; you can use `npm run database`.

`npm test` runs tests on each component. See individual components for things like detailed output and other options.
`npm test-root` runs root tests combining multiple components (e.g., High-Frequency series).

### Coding conventions

See the [Pryv guidelines](http://pryv.github.io/guidelines/).


