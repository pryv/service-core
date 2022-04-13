#!/bin/sh

# This script sets up the test results directory

# working dir fix
scriptsFolder=$(cd $(dirname "$0"); pwd)
cd $scriptsFolder/../..

# check for well known prereqs that might be missing
hash git 2>&- || { echo >&2 "I require git."; exit 1; }

test_results_folder="test_results"

# fetch results repository if needed
if [ ! -d $test_results_folder ]
then
  echo "Setting up 'test_results' folder."
  git clone git@github.com:pryv/test-results-pryv.io.git $test_results_folder
fi

# ensure repository is up-to-date
cd $test_results_folder
git pull
