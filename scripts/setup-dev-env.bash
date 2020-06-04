#!/bin/bash

# Sets up the dev environment on a 64-bit OSX or GNU/Linux system.
# Re-run to update e.g. the node version (from the new default) or the JSHint config (from the master).

# working dir fix
SCRIPT_FOLDER=$(cd $(dirname "$0"); pwd)
cd $SCRIPT_FOLDER/.. # root

. .env # Load env variables

mkdir -p ${PRYV_VAR}
mkdir -p ${PRYV_MONGODATA}

## used in Open Pryv
SCRIPT_EXTRAS="./scripts/setup-open.bash"
if [[ -f $SCRIPT_EXTRAS ]]; then
  echo "installing service mail"
  bash $SCRIPT_EXTRAS
fi

if [[ -d $PRYV_MONGODB ]]; then
  echo "MongoDB, already installed"
else
  echo "installing mongo, data, files and logs in ${PRYV_VAR}"

  mkdir -p ${PRYV_MONGODB}
 
  export LOGS_FOLDER=${PRYV_LOGS}
  export MONGO_BASE_FOLDER=${PRYV_MONGODB}
  export MONGO_DATA_FOLDER=${PRYV_MONGODATA}

  if [ `uname` = "Linux" ]; then
    export MONGO_NAME=mongodb-linux-x86_64-3.6.17
    export MONGO_DL_BASE_URL=https://fastdl.mongodb.org/linux
  elif [ `uname` = "Darwin" ]; then # OSX
    export MONGO_NAME=mongodb-osx-ssl-x86_64-3.6.17
    export MONGO_DL_BASE_URL=https://fastdl.mongodb.org/osx
  else
    echo "Installation is meant to be on Linux or OSX"
    exit 1
  fi

  # file structure

  mkdir -p $LOGS_FOLDER

  # database

  curl -s -L https://pryv.github.io/dev-scripts/core-1.5/setup-mongodb.bash | bash
  EXIT_CODE=$?
  if [[ ${EXIT_CODE} -ne 0 ]]; then
    echo ""
    echo "Error setting up database; setup aborted"
    echo ""
    exit ${EXIT_CODE}
  fi

fi


echo ""
echo "Setup complete!"
echo ""
