#!/bin/sh

# working dir fix
SCRIPT_FOLDER=$(cd $(dirname "$0"); pwd)
cd $SCRIPT_FOLDER/..

../mongodb-osx-x86_64-2.6.0/bin/mongod --dbpath ../mongodb-data
