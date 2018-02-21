#!/bin/bash
set -e
source /pd_build/buildconfig

# Install the application.
run /pd_build/release.sh

# Clean up after ourselves.
run /pd_build/finalize.sh
