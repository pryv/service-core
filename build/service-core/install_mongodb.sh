#!/bin/bash
set -e
source /pd_build/buildconfig

# Versions and urls/paths
mongo_version="2.4.5"
mongo_tar_gz="mongodb-linux-x86_64-$mongo_version.tgz"
mongo_url="http://downloads.mongodb.org/linux/$mongo_tar_gz"
mongo_sha256="2f9791a33dda71f8ee8f40100f49944b9261ed51df1f62bdcbeef2d71973fcbf"

header "Install mongodb"

# Add users to the system
run groupadd -r mongodb 
run useradd -r -g mongodb mongodb

# Download, check and unpack mongodb
pushd /var/pryv
run curl -O $mongo_url
echo -n "$mongo_sha256 $mongo_tar_gz" | sha256sum -c -

mkdir mongodb
pushd /var/pryv/mongodb
run tar --strip-components=1 -xzf ../$mongo_tar_gz
run chown -R mongodb:mongodb .
popd

run rm $mongo_tar_gz
popd

# Create mongodb data dirs
run mkdir -p /data/db /data/configdb \
	&& chown -R mongodb:mongodb /data/db /data/configdb

# And the log file
run touch /var/log/mongodb.log && chown mongodb:mongodb /var/log/mongodb.log

# Copy our config file over. 
run cp /pd_build/config/mongodb.conf /var/pryv/mongodb/

# Have mongodb start on container start
run mkdir /etc/service/mongodb
run cp /pd_build/runit/mongodb /etc/service/mongodb/run
