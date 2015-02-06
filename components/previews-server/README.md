# Pryv browser server

Node.js / Express server supporting the browser client app, offering specific functionality outside the scope of the main Pryv API (e.g. event previews).


## Prerequisites

GraphicsMagick (Linux: `apt-get install graphicsmagick`, OSX (Homebrew): `brew install graphicsmagick`)


## Quick API description

### Event previews: `GET /events/{event-id}`

Returns a JPEG preview of the specified picture event. Authorization is the same as in the Pryv API (i.e. pass token in either `Authorization` header or `auth` query param). Accepted parameters:

- `w` | `width` (number): the desired preview width
- `h` | `height` (number): the desired preview height

Notes:

- Maintains the original's aspect ratio in all cases
- Adjusts the desired size to fit into one of the standard size squares (256x256, 512x512, 768x768, 1024x1024), while guaranteeing the returned size is not smaller than the desired size, except if the latter exceeds the max standard size
- Only `picture:attached` events are supported at the moment (if multiple files are attached the first one is used)
- Updates the corresponding attachment object with its `width` and `height` when initially generating the preview
- Trying to retrieve the preview for events of other types results in a 204 (No Content) response
- Permissions are enforced for the specified access token (you need a `"read"` access to the event to get its preview)
- Generated previews are cached (by default for a week); cached files are tracked via [extended file attributes](http://en.wikipedia.org/wiki/Extended_file_attributes) `event.modified` (to invalidate the cached version when the event is modified) and `last-accessed` (to remove cached files that aren't being used)

## Setting up the development environment

**Preliminary step**: if you'll be working on the [common API server module](https://github.com/pryv/api-server-common) too, clone it somewhere and link it with NPM:

```bash
# from browser-server root directory
npm link <api-server-common working copy path>
```

For now: `npm install`; TODO: at least describe prerequisites (e.g. Mongo)

If you want to locally run the Pryv server environment (e.g. API server, browser server) for client development, start the server specifying `--http.port 5443`.
Cf. https://docs.google.com/a/pryv.com/spreadsheet/ccc?key=0AuGZSo9dfcSZdHZrNnJvQUUwUHgwZXdhT2RNaFd4UVE#gid=4


## Running the tests

- `make` (or `make test`) for quiet output
- `make test-detailed` for detailed test specs and debug log output
- `make test-profile` for profiling the tested server instance and opening the processed output with `tick-processor`
- `make test-coverage` for generating and opening coverage stats (with Blanket.js)
- `make test-debug` is similar as `make test-detailed` but in debug mode (see 'Debugging' below)


## Debugging

`make test-debug` (see above) to attach your debugger of choice.


## Deploying

As the server has a dependency on [api-server-common](https://github.com/pryv/api-server-common) (a private GitHub repo) we must ensure the deploying user's SSH key on the target machine is authorized for accessing the repo on GitHub.

TODO: actual deployment
