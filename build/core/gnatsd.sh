#!/bin/bash
set -e
source /pd_build/buildconfig

VERSION="v1.0.4"
BASENAME="gnatsd-$VERSION-linux-amd64"
FILENAME="$BASENAME.zip"
SOURCE_URL="https://github.com/nats-io/gnatsd/releases/download/$VERSION/$FILENAME"
SPOOLDIR=/var/spool

mkdir -p $SPOOLDIR/gnatsd && \
  cd $SPOOLDIR/gnatsd/ && \
  curl -O $SOURCE_URL && \
  unzip $FILENAME

echo "d6f93ff2951524a49b8eec76b54c86f49616c65c5bbdd0d438d58b3cb6373022  gnatsd-v1.0.4-linux-amd64.zip" | \
  sha256sum -c -

mv $BASENAME/gnatsd /usr/local/bin/


