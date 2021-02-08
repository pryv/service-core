FROM pryvio/intermediate-core:latest

ARG DATA_DIR="/app/data"

# ================================ Gnats =======================================
# Download and expand the gnatsd binary
WORKDIR /var/spool/gnatsd
RUN sh /app/bin/scripts/setup-gnatsd.sh
RUN mv ./gnatsd/gnatsd-v1.0.4-linux-amd64/gnatsd /usr/local/bin/
# ================================ Gnats end =======================================

# Create the data space (attachments/previews)
RUN mkdir -p $DATA_DIR/attachments && \
    mkdir -p $DATA_DIR/previews && \
    chown -R app:app $DATA_DIR

# Clean up after ourselves.
RUN apt-get remove -y autoconf automake 
RUN apt-get autoremove && apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* & rm -rf /app/bin/build