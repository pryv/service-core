FROM pryv/base:1.3.40
MAINTAINER "Tech@Pryv" <tech@pryv.com>

ADD . /app/bin
WORKDIR /app/bin/

# Install the application.
RUN chown app /app/bin

# Perform a release build of the source code. (-> dist)
RUN yarn release > /dev/null

# Remove cron and sshd entirely, unless we use them
RUN rm -r /etc/service/cron
RUN rm -r /etc/service/sshd && rm /etc/my_init.d/00_regen_ssh_host_keys.sh

# Clean up after ourselves.
RUN apt-get remove -y autoconf automake 
RUN apt-get autoremove && apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* & rm -rf /app/bin/build

# We should map the Pryv.IO installation's root configuration directory here. 
# Automatically running from this directory means that we'll probably manage to 
# find the configuration files. 
WORKDIR /app/conf/

# Run the right command:
ENTRYPOINT [ "/app/bin/dist/components/pryvuser-cli/bin/cli" ]


