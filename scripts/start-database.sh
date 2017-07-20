#!/bin/sh

# working dir fix
SCRIPT_FOLDER=$(cd $(dirname "$0"); pwd)
cd $SCRIPT_FOLDER/..


if [ `uname` = "Linux" ]; then
mongod --smallfiles --dbpath /var/pryv/data/mongodb
else
../mongodb-osx-x86_64-3.4.4/bin/mongod --smallfiles --dbpath ../mongodb-data
fi
