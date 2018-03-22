
This document contains a collection of errors that can be thrown by any rpc method that you use via tprpc. It should make error handling easy - by giving you the list of errors and the situations they occur in. 

## TchannelSocketError

```
TchannelSocketError: tchannel socket error (ECONNREFUSED from connect): connect ECONNREFUSED 127.0.0.1:4020
```

When the target refuses a TPC connection. 

