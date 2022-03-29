# add node bin script path for recipes
export PATH := "./node_modules/.bin:" + env_var('PATH')

# Default: display available recipes
_help:
    @just --list

# –––––––––––––----------------------------------------------------------------
# Setup
# –––––––––––––----------------------------------------------------------------

# Install node modules afresh
install *params: clean
    npm install {{params}}

# Clean up dist and node modules
clean:
    rm -rf dist
    rm -rf node_modules
    rm -rf components/**/node_modules

# Install node modules strictly as specified (typically for CI)
install-stable:
    npm ci

# Compile code to dist for dev (with source maps)
compile-dev: _prepare-dist
    babel ./components --out-dir=dist/components --copy-files --include-dotfiles --source-maps both

# Compile code to dist for dev, then watch and recompile on changes
compile-watch: _prepare-dist
    babel ./components --verbose --watch --out-dir=dist/components --copy-files --include-dotfiles --source-maps both

# Compile code to dist for release
compile-release: _prepare-dist
    babel ./components --verbose --out-dir=dist/components --copy-files

_prepare-dist:
    scripts/prepare_dist

# –––––––––––––----------------------------------------------------------------
# Run
# –––––––––––––----------------------------------------------------------------

# Run all dependency services (e.g. nats server, Mongo, Influx…)
start-deps:
    concurrently --names "nats,mongo,influx" \
        --prefix-colors "cyan,green,magenta" \
        nats-server "echo 'TODO: for now Mongo is run separately with \`just start-mongo\`'" influxd

# Run MongoDB
start-mongo:
    # TODO: rename/cleanup that script
    scripts/start-database.sh

# Start the given server component for dev (expects 'dist/{component}/bin/server')
start component:
    cd dist/components/{{component}} && \
    NODE_ENV=development bin/server

# Start the given server component for dev, automatically restarting on file changes (requires nodemon)
start-mon component:
    cd dist/components/{{component}} && \
    NODE_ENV=development nodemon bin/server

# Run the given component binary for dev (expects 'dist/{component}/bin/{bin}')
run component bin:
    cd dist/components/{{component}} && \
    NODE_ENV=development bin/{{bin}}

# –––––––––––––----------------------------------------------------------------
# Test & related
# –––––––––––––----------------------------------------------------------------

# Tag each test with a unique id if missing
tag-tests:
    scripts/tag-tests

# Run tests on the given component ('all' for all components) with optional extra parameters
test component *params:
    NODE_ENV=test COMPONENT={{component}} scripts/components-run \
        npx mocha -- {{params}}

# Run tests with detailed output
test-detailed component *params:
    NODE_ENV=test COMPONENT={{component}} scripts/components-run \
        npx mocha -- --reporter=spec {{params}}

# Run tests with detailed output for debugging
test-debug component *params:
    NODE_ENV=test COMPONENT={{component}} scripts/components-run \
        npx mocha -- --timeout 3600000 --reporter=spec --inspect-brk=40000 {{params}}

# ⚠️  OBSOLETE?: Run tests for profiling
test-profile component *params:
    NODE_ENV=test COMPONENT={{component}} scripts/components-run \
        npx mocha -- --profile=true {{params}} && \
    tick-processor > profiling-output.txt && \
    open profiling-output.txt

# ⚠️  BROKEN: Run tests and generate HTML coverage report
test-cover component *params:
    NODE_ENV=test COMPONENT={{component}} nyc --reporter=html --report-dir=./coverage \
        scripts/components-run npx mocha -- {{params}}

# Set up test results report generation
test-results-init-repo:
    scripts/test-results/init_repo.sh

# Generate test results report
test-results-generate:
    node scripts/test-results/test-results.js

# Upload test results report
test-results-upload:
    scripts/test-results/upload.sh

# Run tracing service (Jaeger)
trace:
    open http://localhost:16686/
    docker run --rm -p 6831:6831/udp -p 6832:6832/udp -p 16686:16686 jaegertracing/all-in-one:1.7 --log-level=debug

# Dump/restore MongoDB test data; command must be 'dump' or 'restore'
test-data command version:
    NODE_ENV=development node dist/components/test-helpers/scripts/{{command}}-test-data {{version}}

# –––––––––––––----------------------------------------------------------------
# Misc. utils
# –––––––––––––----------------------------------------------------------------

# Generate Flow.js coverage report
flow-cover:
    flow-coverage-report -i 'components/**/*.js' -t html

# Update default event types from online reference
update-event-types:
    scripts/update-event-types.bash

# Run source licensing tool (see 'licensing' folder for details)
license:
    source-licenser licensing/config.yml licensing/LICENSE.src ./

# Set version on all 'package.json' (root’s and components’)
version version:
    npm version --no-git-tag-version --workspaces --include-workspace-root {{version}}
