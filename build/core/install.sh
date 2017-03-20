#!/bin/bash
set -e
source /pd_build/buildconfig

# Install the application.
run /pd_build/release.sh

# Remove cron and sshd entirely, unless we use them
run rm -r /etc/service/sshd && rm /etc/my_init.d/00_regen_ssh_host_keys.sh

# Clean up after ourselves.
run /pd_build/finalize.sh
