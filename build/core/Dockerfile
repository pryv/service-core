FROM pryvio/intermediate-core:latest

ARG DATA_DIR="/app/data"

# ================================ Gnats =======================================
# Download and expand the nats-server binary
WORKDIR /var/spool/nats-server
RUN /app/bin/scripts/setup-nats-server
RUN mv ./nats-server/nats-server-v2.3.4-linux-amd64/nats-server /usr/local/bin/
# ================================ Gnats end =======================================

# Create the data space (attachments/previews)
RUN mkdir -p $DATA_DIR/attachments && \
    mkdir -p $DATA_DIR/previews && \
    chown -R app:app $DATA_DIR

# Clean up after ourselves
RUN apt-get remove -y --auto-remove autoconf automake curl build-essential git linux-libc-dev
RUN apt-get autoremove && apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* & rm -rf /app/bin/build
