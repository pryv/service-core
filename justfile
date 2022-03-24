# let recipes run node bin scripts
export PATH := "./node_modules/.bin:" + env_var('PATH')

repo_dir := justfile_directory()

# Default: display available recipes
_help:
    @just --list

# Install node modules afresh
install *params: clean
    npm install {{params}}

# Clean up dist and node modules
clean:
    rm -rf dist
    rm -rf node_modules
    rm -rf components/**/node_modules

install-stable:
    npm ci

# Compile code to dist for dev (with source maps)
compile-dev: _prepare-dist
    babel ./components --out-dir=dist/components --copy-files --source-maps both

# Compile code to dist for dev, then watch and recompile on changes
compile-watch: _prepare-dist
    babel ./components --verbose --watch --out-dir=dist/components --copy-files --source-maps both

# Compile code to dist for release
compile-release: _prepare-dist
    babel ./components --verbose --out-dir=dist/components --copy-files

_prepare-dist:
    scripts/prepare_dist

# Run all dependency services (e.g. nats server, Mongo, Influx…)
start-deps:
    concurrently --names "nats,mongo,influx" nats-server "echo 'TODO: Mongo'" influxd

# Run MongoDB
start-mongo:
    # TODO: rename/cleanup that script
    scripts/start-database.sh

# Run the given component binary for dev (expects `dist/{component}/bin/{bin}`)
run component bin="server":
    cd dist/components/{{component}} && \
    NODE_ENV=development bin/{{bin}}

# Run the given component’s `start` script
start component:
    cd dist/components/{{component}} && \
    npm start

# TODO: clarify & possibly remove
tmp-local:
    cd dist/components/api-server && \
    NODE_ENV=development nodemon bin/server

# TODO: clarify & possibly remove
tmp-metadata:
    cd dist/components/metadata && \
    bin/metadata

# Tag each test with a unique id if missing
tag-tests:
    node scripts/tag-tests.js

# Run tests on all components; optional params are passed over to each component's `test` script
test *params:
    node scripts/components-command npm test {{params}}

# TODO: clarify & possibly remove: Run integration tests
test-root:
    mocha --compilers js:babel-register --timeout 10000 --reporter=dot test/**/*.test.js

# BROKEN: Run tests on all components and generate HTML coverage report
test-cover *params:
    nyc --reporter=html --report-dir=./coverage just test {{params}}

test-results-init-repo:
    scripts/test-results/init_repo.sh

test-results-generate:
    node scripts/test-results/test-results.js

test-results-upload:
    scripts/test-results/upload.sh

# TODO: clarify & possibly remove
tracing:
    open http://localhost:16686/
    docker run --rm -p 6831:6831/udp -p 6832:6832/udp -p 16686:16686 jaegertracing/all-in-one:1.7 --log-level=debug

flow-cover:
    flow-coverage-report -i 'components/**/*.js' -t html

license:
    source-licenser licensing/config.yml licensing/LICENSE.src ./

# Set version on all `package.json` (root’s and components’)
version version:
    npm version --no-git-tag-version --workspaces --include-workspace-root {{version}}
