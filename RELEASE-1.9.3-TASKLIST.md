# RELEASE 1.9.3

- (Optional) provides hooks for encryption mechanisms

## TASKLIST

### Fix issues 
- [ ] test B2I7 is failing when testing `storage` with `full-mongo` as indexes for password is not yet created. Run `just test-full-mongo storage` to reproduce

### Move Attachments to an online storage

- [ ] GridFS
- [ ] S3

### Put all config in MongoDB

- For docker version of open-pryv.io. 
  - default config to be hardcoded in container 
  - Custom value saved in mongoDB, with connection parameters given by `env`   
