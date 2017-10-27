FROM pryv/base:1.2.13
MAINTAINER "Tech@Pryv" <tech@pryv.com>

ADD . /pd_build
RUN /pd_build/install.sh

# Ports:
#   9000        previews api
#
EXPOSE 9000

