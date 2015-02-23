# pryvuser CLI

Utility to locally manage user accounts.


## Usage

Currently the only command implemented is `pryvuser delete <username>`.

`pryvuser --help` gives usage details. The tool expects a config file either to be passed in via `--config [path]` or to be present in `<working directory>/api-server.config.json`.


## Contribute

Make sure to check the root README first.


### Tests

- `npm run test` (or `npm test`) for quiet output
- `npm run test-detailed` for detailed test specs and debug log output
- `npm run test-profile` for profiling the tested server instance and opening the processed output with `tick-processor`
- `npm run test-debug` is similar as `npm run test-detailed` but in debug mode; it will wait for a debugger to be attached on port 5858
