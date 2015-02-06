#!/bin/bash

INSPECTOR=node-inspector
URL=http://127.0.0.1:8080/debug?port=5858

# check for node-inspector
which $INSPECTOR &> /dev/null
if [[ $? -ne 0 ]]; then
  echo ""
  echo "node-inspector not found; installing..."
  echo ""
  npm install -g node-inspector
fi

echo ""
echo "Launching tests in debug mode & attaching node-inspector..."
echo ""

# working dir fix
SCRIPT_FOLDER=$(cd $(dirname "$0"); pwd)
cd $SCRIPT_FOLDER/..

startInspectorDelayed() {
  sleep 1
  $INSPECTOR &
  sleep 1
  open $URL
}
startInspectorDelayed &

make test-debug

# Kill node-inspector when done (it seems we cannot start a debugging session with the inspector running anyway)
kill `ps -axwwwww | grep $INSPECTOR | grep -v grep | awk '{print $1}'`
