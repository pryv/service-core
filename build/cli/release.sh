#!/bin/bash
set -e
source /pd_build/buildconfig

target_dir="/app/bin"
conf_dir="/app/conf"

header "Install application from release.tar"

run mkdir -p $target_dir
run chown app $target_dir

# This will avoid getting DOSed by unicode.org because of the unicode npm package.
minimal_apt_get_install unicode-data

# Unpack the application and run npm install. 
pushd $target_dir
#run run tar -x --owner app -f \
#  /pd_build/release.tar .

#PYTHON=$(which python2.7) run yarn install

# Perform a release build of the source code. (-> dist)
run yarn release > /dev/null

