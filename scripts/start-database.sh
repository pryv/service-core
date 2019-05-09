#!/bin/sh

# working dir fix
SCRIPT_FOLDER=$(cd $(dirname "$0"); pwd)
cd $SCRIPT_FOLDER/..


../mongo-bin/bin/mongod --smallfiles --dbpath ../mongodb-data

