#!/bin/bash
set -e
source /pd_build/buildconfig

target_dir="/app/bin"
log_dir="/app/log"
conf_dir="/app/conf"

header "Install application from release.tar"

run mkdir -p $target_dir
run chown app $target_dir

# Unpack the application and run npm install. 
pushd $target_dir
run run tar -x --owner app -f \
  /pd_build/release.tar .

PYTHON=$(which python2.7) run yarn install --production

# Install the config file
run mkdir -p $conf_dir && \
  cp /pd_build/config/preview.json $conf_dir/preview.json

# Create the log
run mkdir -p $log_dir && chown -R app:app $log_dir && \
  touch $log_dir/preview.log

# Install the script that runs the api service
run mkdir /etc/service/preview
run cp /pd_build/runit/preview /etc/service/preview/run

# Have CRON run in this container
run rm /etc/service/cron/down
