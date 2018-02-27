#!/bin/bash
set -e
source /pd_build/buildconfig

target_dir="/app/bin"
log_dir="/app/log"
conf_dir="/app/conf"
data_dir="/app/data"

header "Install application from release.tar"

run mkdir -p $target_dir
run chown app $target_dir

# This will avoid getting DOSed by unicode.org because of the unicode npm package.
minimal_apt_get_install unicode-data

# Unpack the application and run npm install. 
pushd $target_dir
run run tar -x --owner app -f \
  /pd_build/release.tar .

PYTHON=$(which python2.7) run yarn install

# Perform a release build of the source code. (-> lib)
run yarn release > /dev/null

# Install the config file
run mkdir -p $conf_dir && \
  run cp /pd_build/config/core.json $conf_dir/core.json
  
# Install the procfile (for running node-foreman)
run cp /pd_build/config/production.procfile \
  dist/components/api-server/production.procfile

# Create the log
run mkdir -p $log_dir && \
  run touch $log_dir/core.log && run chown -R app:app $log_dir

# Create the data space (attachments/previews)
run mkdir -p $data_dir/attachments && \
  run mkdir -p $data_dir/previews && \
  run chown -R app:app $data_dir

# Install the script that runs the api service
run mkdir /etc/service/core
run cp /pd_build/runit/core /etc/service/core/run

# Install the script that runs the cron service
run mkdir /etc/service/nightly
run cp /pd_build/runit/nightly /etc/service/nightly/run
