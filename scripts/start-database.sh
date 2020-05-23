#!/bin/sh

# working dir fix
SCRIPT_FOLDER=$(cd $(dirname "$0"); pwd)
cd $SCRIPT_FOLDER/..
. .env


export MONGO_BASE_FOLDER=${PRYV_MONGODB}
export MONGO_DATA_FOLDER=${PRYV_MONGODATA}

echo $PRYV_VAR
${MONGO_BASE_FOLDER}/bin/mongod --dbpath ${MONGO_DATA_FOLDER}

