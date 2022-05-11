#!/bin/bash

# working dir fix
scriptsFolder=$(cd $(dirname "$0"); pwd)
cd $scriptsFolder/../..

TEST_RESULTS_FOLDER="test_results";
cd $TEST_RESULTS_FOLDER

git add . && git add -u . && git commit -m "upload test results" && git push;
