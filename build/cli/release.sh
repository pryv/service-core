#!/bin/bash
set -e
source /pd_build/buildconfig

target_dir="/app/bin"
conf_dir="/app/conf"

run chown app $target_dir

# This will avoid getting DOSed by unicode.org because of the unicode npm package.
minimal_apt_get_install unicode-data

# Perform a release build of the source code. (-> dist)
run yarn release > /dev/null

