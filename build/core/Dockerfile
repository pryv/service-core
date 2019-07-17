FROM pryvsa-docker-release.bintray.io/pryv/base:1.3.36
MAINTAINER "Tech@Pryv" <tech@pryv.com>

ADD . /pd_build
RUN /pd_build/install.sh

# Ports:
#   9000        core api
#
EXPOSE 9000

