# Pryv core service

Pryv core server app components, ie. what runs on each server node and handles user data.


## Contribute

### Prerequisites

Node v0.12+ and MongoDB v2.6.0.

`./scripts/setup-dev-env.bash` installs MongoDB in the parent folder and sets up your working copy with a JSHint commit hook and `npm install` if needed.

Note: MongoDB needs at least 4GB of free disk space for its initial database.


### About code structure

Code is organized into local modules defined in the `components` folder, each with its own `package.json`. Components thus defined help code modularity and potential extraction into separate npm modules.

- Shared dependencies are defined in the root `package.json`
- `npm run check-dependencies` lists declared dependencies (both shared and components'), highlighting those declared multiple times
- `npm install` installs each component's dependencies and the shared ones
- `scripts/components-npm.js` can be used to automatically run npm commands on every component. For example, `node scripts/components-npm outdated` outputs each component's outdated dependencies.


### Tests

_Prerequisite:_ MongoDB must be running on the default port; you can use `npm run start-database`.

`npm test` runs tests on each component. See individual components for things like detailed output and other options.


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
