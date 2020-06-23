#!/bin/bash
set -e
source /pd_build/buildconfig

target_dir="/app/bin"
log_dir="/app/log"
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

# Perform a release build of the source code. (-> lib)
run yarn release > /dev/null

# Install the config file
run mkdir -p $conf_dir && \
  run cp /pd_build/config/hfs.json $conf_dir/hfs.json && \
  run cp /pd_build/config/metadata.hjson $conf_dir/
  
# Create the log
run mkdir -p $log_dir && \
  run chown -R app:app $log_dir && \
  run touch $log_dir/hfs.log

# Install the script that runs the api service
run mkdir /etc/runit
run cp -r /pd_build/runit/* /etc/runit/
run mv /etc/runit/runit.sh /etc/init.d/
run mkdir /etc/service/runit
run ln -s /etc/init.d/runit.sh /etc/service/runit/run #make a link to /etc/service (will be run with runit).