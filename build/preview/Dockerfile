FROM pryvio/intermediate-preview:latest

# install graphicsmagick that is specific for preview image
RUN apt-get update && apt-get install -y graphicsmagick

# Clean up after ourselves.
RUN apt-get remove -y autoconf automake 
RUN apt-get autoremove && apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* & rm -rf /app/bin/build