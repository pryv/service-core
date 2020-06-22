
pryv-cli(1) -- manages user accounts on a Pryv.IO 'core' machine. 
=================================================================

## SYNOPSIS

```shell
# Provides subcommand overview and help
$ pryv-cli -h

# Deletes the user 'jsmith' on the current machine. 
$ pryv-cli delete-user jsmith
```

## DESCRIPTION

### Setup

For a setup in our docker environment, see the following instructions:
  - [cluster](https://github.com/pryv/config-template-pryv.io/blob/master/pryv.io/cluster/delete-user.md)
  - [single-node](https://github.com/pryv/config-template-pryv.io/blob/master/pryv.io/single%20node/delete-user.md)

### Delete User

```shell
$ pryv-cli delete-user [options] USERNAME
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

# License
Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
Unauthorized copying of this file, via any medium is strictly prohibited
Proprietary and confidential