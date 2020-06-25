FROM pryv/base:1.3.40
MAINTAINER "Tech@Pryv" <tech@pryv.com>

COPY . /app/bin

# Move building scripts to pd_build (cli files expect building related scripts to be there)
RUN mv /app/bin/build/webhooks/ /pd_build/

WORKDIR /app/bin
RUN /pd_build/install.sh


