FROM pryv/base:1.0.0
MAINTAINER "Tech@Pryv" <tech@pryv.com>

ADD . /pd_build
RUN /pd_build/install.sh

# Ports:
#   9000        core api
#
EXPOSE 9000

