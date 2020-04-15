#!/bin/sh

# working dir fix
SCRIPT_FOLDER=$(cd $(dirname "$0"); pwd)
cd $SCRIPT_FOLDER/..


../mongo-bin/bin/mongod --dbpath ../mongodb-data

