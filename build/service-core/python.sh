#!/bin/bash
set -e
source /pd_build/buildconfig

header "Python installation (for building npm modules via node-gyp)"

run minimal_apt_get_install python2.7

