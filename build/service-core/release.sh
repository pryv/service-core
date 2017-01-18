#!/bin/bash
set -e
source /pd_build/buildconfig

target_dir="/var/src/service-core"
log_dir="/var/pryv/data/log"

api_log_file="$log_dir/api-server.errors.log"
previews_log_file="$log_dir/previews-server.errors.log"

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
run cp /pd_build/config/previews.json $target_dir/previews.json

# Create the log
run mkdir -p $log_dir
run touch $api_log_file && chown app:app $api_log_file
run touch $previews_log_file && chown app:app $previews_log_file

# Install the script that runs the api service
run mkdir /etc/service/service-core
run cp /pd_build/runit/service-core /etc/service/service-core/run

# Install the script that runs the previews service
run mkdir /etc/service/previews
run cp /pd_build/runit/previews /etc/service/previews/run

# Have CRON run in this container
run rm /etc/service/cron/down
