FROM pryv/base:1.3.40
MAINTAINER "Tech@Pryv" <tech@pryv.com>

COPY . /app/bin

# Move building scripts to pd_build (.sh files expect it to be there)
RUN mv /app/bin/build/core/ /pd_build/

WORKDIR /app/bin
RUN /pd_build/install.sh

# Ports:
#   9000        hfs api
#
EXPOSE 9000

