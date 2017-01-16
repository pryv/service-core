#!/bin/bash
set -e
source /pd_build/buildconfig

service_name="service-core"
target_dir="/var/pryv/$service_name"

header "Install application from release.tar"

run mkdir -p $target_dir
run chown app $target_dir

# Unpack the application and run npm install. 
cd $target_dir
run run tar -x --owner app -f \
  /pd_build/release.tar .

run npm install --production

# run cp /pd_build/config/service-core.json $target_dir/production.json

# run mkdir /etc/service/$service_name
# run cp /pd_build/runit/$service_name /etc/service/$service_name/run
