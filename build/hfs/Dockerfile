FROM pryvio/intermediate-hfs:latest

# Copy config files to config dir
RUN cp /app/bin/build/hfs/config/metadata.hjson /app/conf/

# Clean up after ourselves.
RUN apt-get remove -y autoconf automake 
RUN apt-get autoremove && apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* & rm -rf /app/bin/build