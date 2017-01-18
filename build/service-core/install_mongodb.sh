#!/bin/bash
set -e
source /pd_build/buildconfig

# Versions and urls/paths
mongo_version="2.4.5"
mongo_tar_gz="mongodb-linux-x86_64-$mongo_version.tgz"
mongo_url="http://downloads.mongodb.org/linux/$mongo_tar_gz"
mongo_sha256="2f9791a33dda71f8ee8f40100f49944b9261ed51df1f62bdcbeef2d71973fcbf"
target_dir="/var/src"
data_dir="/var/pryv/data/mongodb"
log_dir="/var/pryv/data/log"

header "Install mongodb"

mkdir -p $target_dir

# Add users to the system
run groupadd -r mongodb 
run useradd -r -g mongodb mongodb

# Download, check and unpack mongodb
pushd $target_dir
run curl -O $mongo_url
echo -n "$mongo_sha256 $mongo_tar_gz" | sha256sum -c -

mkdir mongodb
pushd $target_dir/mongodb
run tar --strip-components=1 -xzf ../$mongo_tar_gz
run chown -R mongodb:mongodb .
popd

run rm $mongo_tar_gz
popd

# Create mongodb data dirs
run mkdir -p $data_dir && chown -R mongodb:mongodb $data_dir

# And the log file
run mkdir -p $log_dir && touch $log_dir/mongodb.log && chown mongodb:mongodb $log_dir/mongodb.log

# Copy our config file over. 
run cp /pd_build/config/mongodb.conf $target_dir/mongodb/

# Have mongodb start on container start
run mkdir /etc/service/mongodb
run cp /pd_build/runit/mongodb /etc/service/mongodb/run
