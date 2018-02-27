#!/bin/bash
set -e
source /pd_build/buildconfig

VERSION="v1.0.4"
BASENAME="gnatsd-$VERSION-linux-amd64"
FILENAME="$BASENAME.zip"
SOURCE_URL="https://github.com/nats-io/gnatsd/releases/download/$VERSION/$FILENAME"
SPOOLDIR=/var/spool

minimal_apt_get_install unzip

run mkdir -p $SPOOLDIR/gnatsd && \
  run cd $SPOOLDIR/gnatsd/ && 
  run curl -L -O $SOURCE_URL && 
  run unzip $FILENAME

run echo "24446c1be57d08ccc386a240a8ab5b78668e4db5d0c7878d548d3f95b90cb76b  $FILENAME" | \
  run sha256sum -c -

run mv $BASENAME/gnatsd /usr/local/bin/


