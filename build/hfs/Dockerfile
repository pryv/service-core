FROM pryv/base:1.3.40
MAINTAINER "Tech@Pryv" <tech@pryv.com>

COPY . /app/bin

# delete installed node modules because they are removed from .dockerignore
RUN rm -rf /app/bin/node_modules

# Move building scripts to pd_build (cli files expect building related scripts to be there)
RUN mv /app/bin/build/hfs/ /pd_build/

WORKDIR /app/bin
RUN /pd_build/install.sh

# Ports:
#   9000        hfs api
#
EXPOSE 9000

