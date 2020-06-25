FROM pryv/base:1.3.40
MAINTAINER "Tech@Pryv" <tech@pryv.com>

COPY . /app/bin

# Move building scripts to pd_build (cli files expect building related scripts to be there)
RUN mv /app/bin/build/cli/ /pd_build/

WORKDIR /app/bin

RUN /pd_build/install.sh

# We should map the Pryv.IO installation's root configuration directory here. 
# Automatically running from this directory means that we'll probably manage to 
# find the configuration files. 
WORKDIR /app/conf/

# Run the right command:
ENTRYPOINT [ "/app/bin/dist/components/pryvuser-cli/bin/cli" ]
