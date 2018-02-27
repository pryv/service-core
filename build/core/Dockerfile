FROM pryv/base:1.2.13
MAINTAINER "Tech@Pryv" <tech@pryv.com>

ENV DISABLE_CRON=1 \
    DISABLE_SSH=1 \
    DISABLE_SYSLOG=0
    
ADD . /pd_build
RUN /pd_build/install.sh

# Ports:
#   9000        core api
#
EXPOSE 9000

