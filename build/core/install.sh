#!/bin/bash
set -e
source /pd_build/buildconfig

# Download and expand the gnatsd binary
run /pd_build/gnatsd.sh

# Install the application.
run /pd_build/release.sh

# Clean up after ourselves.
run /pd_build/finalize.sh
