# SYNOPSIS

Utility to manage user accounts by running a tool on a Pryv.IO 'core' machine. 

```shell
$ bin/cli -h
# Provides subcommand overview and help

$ bin/cli delete-user jsmith
```

# DESCRIPTION

## Delete User

```shell
$ bin/cli delete-user [options] USERNAME
```

Deletes user identified by his username. This will only work for a user that 
has his/her data on the current machine. Valid options are: 

  * `--no-interaction`: 
    In normal operation, the tool will ask for confirmation of the username 
    before starting the actual deletion. This flag turns off the confirmation, 
    allowing to run the script as part of a bigger automated procedure. 


# LICENSE

Copyright 2013-2018, Pryv SA. All rights reserved. 
