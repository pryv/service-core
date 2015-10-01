# Pryv core service

Pryv core server app components, ie. what runs on each server node and handles user data.


## Usage

### Install

_Prerequisites:_ Node v0.12+, Mongo DB v2.6+ (needs at least 4GB of free disk space for the initial database), Nginx (optional, skip if you don't need the proxy server).

Then just `npm install`.


### Component-specific usage

See individual component READMEs for instructions.


### Quick, run the servers

`npm run all` runs everything in a single console with `development` settings. To run processes individually:

- `npm run database` runs Mongo DB from its expected location
- `npm run api` runs the API server
- `npm run previews` runs the previews server
- `npm run proxy` compiles the Nginx config (see below) then runs Nginx

The proxy runs on `https://{username}.rec.la:8080` (`{username}` can be anything; see [Nginx proxy config below](#nginx-proxy)) and is configured as follows:

- `/api/{path}` proxies for `/{path}` on the API server
- `/previews/{path}` proxies for `/{path}` on the previews server
- `/{path}` serves files from `{static.root}` as defined in the Nginx config


### Configuration

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

The `proxy` folder contains a Nginx configuration template (`nginx.conf.template`) as well as corresponding variables for `development` and `production` or `` (generic) environments (`vars.{environment}.js`). To manually generate a `nginx.conf`, do `node scripts/compile-proxy-config {environment}` (this is automatically done for development when running the proxy with `npm run proxy`).

In development, Nginx runs on HTTPS with a "dev" SSL certificate on domain `*.rec.la` (where `*` is whatever Pryv username you like), whose DNS entry points to `127.0.0.1`. This little trick enables HTTPS connections to the local server via wildcard subdomains, without having to rely on additional tools like Dnsmasq.


## Contribute

### Setup the dev environment

`./scripts/setup-dev-env.bash` installs MongoDB in the parent folder, sets up your working copy with a JSHint commit hook, and `npm install`s if needed.


### About code structure

Code is organized into local modules defined in the `components` folder, each with its own `package.json`. Components thus defined help code modularity and potential extraction into separate npm modules.

- Shared dependencies are defined in the root `package.json`
- `npm run check-dependencies` lists declared dependencies (both shared and components'), highlighting those declared multiple times
- `npm install` installs each component's dependencies and the shared ones
- `scripts/components-npm.js` can be used to automatically run npm commands on every component. For example, `node scripts/components-npm outdated` outputs each component's outdated dependencies.


#### Versioning

We set all components' version to that of the root package for clarity.
`npm run update-components-version` does that automatically.


### Tests

_Prerequisite:_ MongoDB must be running on the default port; you can use `npm run database`.

`npm test` runs tests on each component. See individual components for things like detailed output and other options.


### Code analysis

_Prerequisite:_ [Plato](https://www.npmjs.com/package/plato)

`npm run analysis` produces and opens a report with various code stats and linting output.  


### Coding conventions

See the [Pryv guidelines](http://pryv.github.io/guidelines/).


### Deployment (Pryv-specific)

_Prerequisite:_ setup Git remotes for production and staging targets (in `.git/config`):

```
[remote "staging"]
  fetch = +refs/heads/*:refs/remotes/stage/*
  url = git@sthead.pryv.net:~/repos/api-server
[remote "production"]
  fetch = +refs/heads/*:refs/remotes/prod/*
  url = git@head.pryv.net:~/repos/api-server
```

To deploy (`{target}` is either `staging` or `production`):

1. Make sure the version to deploy is properly tagged (e.g. `{major}.{minor}.{revision}`)
2. `git checkout {target}`
3. `git merge {version tag}`
4. `git push {target} {target}`
5. `git push origin {target}` to keep origin up-to-date

(Your Git SSH key must be authorized for deployment.)


## TODO: more on deployment etc.

This is a work in progress.

