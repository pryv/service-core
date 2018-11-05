
pryv-cli(1) -- manages user accounts on a Pryv.IO 'core' machine. 
=================================================================

## SYNOPSIS

```shell
# Provides subcommand overview and help
$ bin/cli -h

# Deletes the user 'jsmith' on the current machine. 
$ bin/cli delete-user jsmith
```

## DESCRIPTION

### Setup

**pryv-cli** is meant to run on a Pryv.IO 'core' machine. We'll assume that 
your installation is based on docker and runs - among other things - a 'mongodb' 
and a 'influxdb' instance. 

The 'core' machine should also have a configuration directory where all Pryv.IO
configuration files reside. The following instructions assume that these files 
are located below a PRYVIO_BASE_DIR. 

Run this command to find the backend network bridge for the Pryv.IO 
installation:

```shell
$ docker network ls
```

This will list a few networks; the network you're looking for combines the 
name for your installation with the postfix '**_backend**'. We refer to this network
as NETWORK in the following instructions.

We further assume that you hold a valid Pryv.IO license and that you're 
authorised to operate on the machine. Some operations - especially deleting 
users - are permanent. Please exercise proper care. 

The easiest way to run **pryv-cli** is through a docker container. To make this 
easier in day to day life, here's a useful shell alias: 

```shell
$ alias pryv-cli='docker run --read-only \
  -v ${PRYVIO_BASE_DIR}:/app/conf/:ro \
  -v ${PRYVIO_BASE_DIR}/conf/core/data/:/app/data/ \
  --network ${NETWORK} -ti \
  pryvsa-docker-release.bintray.io/pryv/cli:1.3.35 $*'
```

With this, you can invoke **pryv-cli** like so: 

```shell
$ pryv-cli -h
```

The first time you run it, it will download the docker image from the distribution
platform; time to grab a coffee! All subsequent runs will be instant. 

### Delete User

```shell
$ bin/cli delete-user [options] USERNAME
```

Deletes user identified by his username. This will only work for a user that 
has his/her data on the current machine. 

As a first stage **pryv-cli** performs a preflight check. During this phase, it
tries to reach all relevant backends; if one of them is not reachable, the 
deletion fails. After preflight you're asked to confirm user deletion. 

If you say yes at this prompt, the user's data will be **IRREVOCABLY GONE**. 

Valid options are: 

  * `-n`, `--no-interaction`: 
    In normal operation, the tool will ask for confirmation of the username 
    before starting the actual deletion. This flag turns off the confirmation, 
    allowing to run the script as part of a bigger automated procedure. 


## RETURN VALUES

### Delete User

If deletion fails, an error message is printed and the process exits with code 3. 
Code 2 indicates that the user aborted by saying 'no' at the confirmation
prompt. Code 1 indicates that the preflight check has failed. 

When the configuration of the 'core' machine cannot be located, the process 
terminates with code 4. 

## BUGS

If you find a strange behaviour or a bug in **pryv-cli**, please send an email
describing the issue to support@pryv.com.

## COPYRIGHT

Copyright 2013-2018, Pryv SA. All rights reserved. 
