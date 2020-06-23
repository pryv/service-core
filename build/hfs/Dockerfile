FROM pryv/base:1.3.40  as intermediate
MAINTAINER "Tech@Pryv" <tech@pryv.com>

COPY . /app/bin

ARG SSH_PRIVATE_KEY
ARG SSH_PUBLIC_KEY

WORKDIR /app/bin

#Pass the content of the private key into the container
RUN echo "${SSH_PRIVATE_KEY}" > /root/.ssh/id_rsa
RUN echo "${SSH_PUBLIC_KEY}" > /root/.ssh/id_rsa.pub
#Github requires a private key with strict permission settings
RUN chmod 600 /root/.ssh/id_rsa
#Add Github to known hosts
RUN touch /root/.ssh/known_hosts
RUN ssh-keyscan github.com >> /root/.ssh/known_hosts

#Install the packages and create node_modules folder
RUN yarn install

# build the main image
FROM pryv/base:1.3.40
MAINTAINER "Tech@Pryv" <tech@pryv.com>


# Copy installed packages to the new images
COPY --from=intermediate /app/bin /app/bin

# Move building scripts to pd_build (.sh files expect it to be there)
RUN mv /app/bin/build/core/ /pd_build/

WORKDIR /app/bin
RUN /pd_build/install.sh

# Ports:
#   9000        hfs api
#
EXPOSE 9000

