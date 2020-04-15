#!/bin/bash

# Sets up the dev environment on a 64-bit OSX or GNU/Linux system.
# Re-run to update e.g. the node version (from the new default) or the JSHint config (from the master).

# working dir fix
SCRIPT_FOLDER=$(cd $(dirname "$0"); pwd)
cd $SCRIPT_FOLDER/.. # root

export DATA_FOLDER=$SCRIPT_FOLDER/../..
export LOGS_FOLDER=${DATA_FOLDER}/logs
export MONGO_BASE_FOLDER=$DATA_FOLDER
export MONGO_DATA_FOLDER=$DATA_FOLDER/mongodb-data

if [ `uname` = "Linux" ]; then
  export MONGO_NAME=mongodb-linux-x86_64-3.6.17
  export MONGO_DL_BASE_URL=https://fastdl.mongodb.org/linux
elif [ `uname` = "Darwin" ]; then # OSX
  export MONGO_NAME=mongodb-osx-x86_64-3.6.17
  export MONGO_DL_BASE_URL=http://fastdl.mongodb.org/osx
else
  echo "Installation is meant to be on Linux or OSX"
  exit 1
fi

# file structure

mkdir -p $LOGS_FOLDER

# database

curl -s -L https://pryv.github.io/dev-scripts/setup-mongodb.bash | bash
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
