# docker build -t perki/ubuntu-pryv-service-core .
# docker run -i -v /Users/perki/wActiv/docker_var_pryv/:/var/pryv -p 10000:10000 perki/ubuntu-pryv-service-core


FROM ubuntu:14.04


ENV NODE_VERSION 0.12.7
ENV NPM_VERSION 2.11.3

RUN apt-get update && apt-get install -y \
    git \
    curl \
    mongodb=2.6.0 \
    && rm -rf /var/lib/apt/lists/*

RUN curl -SLO "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.gz" \
	&& tar -xzf "node-v$NODE_VERSION-linux-x64.tar.gz" -C /usr/local --strip-components=1 \
	&& rm "node-v$NODE_VERSION-linux-x64.tar.gz" \
	&& npm install -g npm@"$NPM_VERSION" \
	&& npm install -g supervisor
	&& npm cache clear



RUN mkdir -p /var
VOLUME ["/var/pryv"]

# Bundle app source
COPY . /src

RUN cd /src; npm install --unsafe-perm --production

EXPOSE  10000
#EXPOSE  4000

ENV NODE_PATH /src/

 CMD ["/usr/local/bin/supervisor", \
  "-e", "json", \
	"-w", "/var/pryv/browser-server.config.json", \
	"--", "/src/browser-server/source/server.js",  \
	"--config", "/var/pryv/browser-server.config.json"]

CMD ["netcat", "-l", "10000"]