#!/bin/bash

# Sets up the dev environment on a 64-bit OSX system.
# Re-run to update e.g. the node version (from the new default) or the JSHint config (from the master).

# working dir fix
SCRIPT_FOLDER=$(cd $(dirname "$0"); pwd)
cd $SCRIPT_FOLDER/.. # root

export NODE_VERSION=v0.12.0

export DATA_FOLDER=$SCRIPT_FOLDER/../..
export LOGS_FOLDER=${DATA_FOLDER}/logs

export MONGO_NAME=mongodb-osx-x86_64-2.6.0
export MONGO_DL_BASE_URL=http://fastdl.mongodb.org/osx
export MONGO_BASE_FOLDER=$DATA_FOLDER
export MONGO_DATA_FOLDER=$DATA_FOLDER/mongodb-data

# base

curl -s -L https://raw.github.com/pryv/dev-scripts/master/setup-repo-copy.js-node.bash | bash
EXIT_CODE=$?
if [[ ${EXIT_CODE} -ne 0 ]]; then
  echo ""
  echo "Error: base setup failed. Setup aborted."
  echo ""
  exit $((${EXIT_CODE}))
fi

# file structure

mkdir -p $LOGS_FOLDER

# database

curl -s -L https://raw.github.com/pryv/dev-scripts/master/setup-mongodb.bash | bash
EXIT_CODE=$?
if [[ ${EXIT_CODE} -ne 0 ]]; then
  echo ""
  echo "Error setting up database; setup aborted"
  echo ""
  exit ${EXIT_CODE}
fi


echo ""
echo "Setup complete!"
echo ""
