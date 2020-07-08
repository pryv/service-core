FROM pryv/intermediate-webhooks:latest

# Only clean up after ourselves.
RUN apt-get remove -y autoconf automake 
RUN apt-get autoremove && apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* & rm -rf /app/bin/build