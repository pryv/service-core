FROM pryv/base:1.0.0
MAINTAINER "Tech@Pryv" <tech@pryv.com>

ADD . /pd_build
RUN /pd_build/install.sh

# MongoDB data directories
VOLUME /data/db /data/configdb

# Ports: 
#   9000        main api server
#   5353/udp    dns interface for service-register
#
# EXPOSE 9000 5353/udp

