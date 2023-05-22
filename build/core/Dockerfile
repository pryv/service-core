FROM pryvio/intermediate-core:latest

# ================================ Gnats =======================================
# Download and expand the nats-server binary
WORKDIR /var/spool/nats-server
RUN /app/bin/scripts/setup-nats-server
RUN mv ./nats-server/nats-server-v2.3.4-linux-amd64/nats-server /usr/local/bin/
# ================================ Gnats end =======================================

# config, data and log directories are mapped as Docker volumes, so don't need to be handled here

RUN apt-get install -y netcat

# Clean up after ourselves
RUN apt-get remove -y --auto-remove autoconf automake curl build-essential git linux-libc-dev
RUN apt-get autoremove && apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* & rm -rf /app/bin/build
