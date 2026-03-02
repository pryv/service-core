FROM pryvio/intermediate-core:latest

# config, data and log directories are mapped as Docker volumes, so don't need to be handled here

# Clean up after ourselves
RUN apt-get remove -y --auto-remove autoconf automake curl build-essential git linux-libc-dev
RUN apt-get autoremove && apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* & rm -rf /app/bin/build
