#!/bin/bash
set -e
source /pd_build/buildconfig

target_dir="/app/bin"
conf_dir="/app/conf"

run chown app $target_dir

# Perform a release build of the source code. (-> dist)
run yarn release > /dev/null

