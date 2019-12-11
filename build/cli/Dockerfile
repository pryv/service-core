FROM pryv/base:1.3.40
MAINTAINER "Tech@Pryv" <tech@pryv.com>

ADD . /pd_build
RUN /pd_build/install.sh

# We should map the Pryv.IO installation's root configuration directory here. 
# Automatically running from this directory means that we'll probably manage to 
# find the configuration files. 
WORKDIR /app/conf/

# Run the right command:
ENTRYPOINT [ "/app/bin/dist/components/pryvuser-cli/bin/cli" ]
