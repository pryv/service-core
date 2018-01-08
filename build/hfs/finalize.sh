#!/bin/bash
set -e
source /pd_build/buildconfig

header "Finalizing..."

run apt-get remove -y autoconf automake
run apt-get autoremove
run apt-get clean
run rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*
run rm -rf /pd_build

