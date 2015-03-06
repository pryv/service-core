# Pryv API server

Node.js / Express server to manage user activity and user administration requests.


## Usage

### Running the server

```bash
node src/server [options]
```

See [the root README](https://github.com/pryv/service-core/blob/master/README.md#about-configuration) to learn about configuration options.


### API

See the [Pryv API reference documentation](https://pryv.github.io/reference/).


## Contribute

Make sure to check the root README first.


### About event types definitions

The server tries to validates incoming event data for known types.
The default source for event types definitions is in `schema/default-event-types.json`, and this file
must be kept up-to-date by running `npm run update-event-types`, which fetches the "official"
version published online.
(The server also tries to update this asynchronously at startup but fallbacks to the default definitions
in the meantime and if the online version is unavailable or corrupted.)


### Tests

- `npm run test` (or `npm test`) for quiet output
- `npm run test-detailed` for detailed test specs and debug log output
- `npm run test-profile` for profiling the tested server instance and opening the processed output with `tick-processor`
- `npm run test-debug` is similar as `npm run test-detailed` but in debug mode; it will wait for debuggers to be attached on both ports 5858 (the test process) and 5959 (the tested server process)

Note that acceptance tests covering the API methods use the HTTP API (that was implemented first); acceptance tests using Socket.IO only cover socket-specific functionality, not API commands.
