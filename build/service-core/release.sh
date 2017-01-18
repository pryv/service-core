#!/bin/bash
set -e
source /pd_build/buildconfig

service_name="service-core"
target_dir="/var/src/$service_name"
log_dir="/var/pryv/data/log"
log_file="$log_dir/api-server.errors.log"

header "Install application from release.tar"

run mkdir -p $target_dir
run chown app $target_dir

# Unpack the application and run npm install. 
cd $target_dir
run run tar -x --owner app -f \
  /pd_build/release.tar .

PYTHON=$(which python2.7) run npm run preinstall --production
PYTHON=$(which python2.7) run npm install --production

# Install the config file
run cp /pd_build/config/service-core.json $target_dir/default.json

# Create the log
run mkdir -p $log_dir && touch $log_file && \
  chown app:app $log_file

# Install the script that runs the nodejs service
run mkdir /etc/service/$service_name
run cp /pd_build/runit/$service_name /etc/service/$service_name/run

# Have CRON run in this container
run rm /etc/service/cron/down
