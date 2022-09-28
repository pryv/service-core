# Proof of Concept for SQLite event storage. 

Current storage can be activated by changing the following line in `mall/src/index.js` to point SQLite storage

```
const LocalStore: DataStore = require('storage/src/localDataStore');
```

Goal, of this code it to be able to pass the tests suites. 

When it work it might be integrated as an option. 

### Todo
- Find a better way to for FTS (full text search to handle UNARY not)
@see: https://sqlite.org/forum/forumpost/5e894702565f50331a04a4d1ec10e37ade0f17e5a57516fac935a1cdc89a0935

- Prepare migration schemas

- Remove DB logic from 'audit' and package it

- Check if it's OK to use: unsafeMode on DB
    https://github.com/JoshuaWise/better-sqlite3/blob/master/docs/unsafe.md
  - This is usefull when performing updateMany loop (read + write)
  - some refs: https://github.com/JoshuaWise/better-sqlite3/issues/203


- CloseDb and delete files and userDelete
# License
Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
Unauthorized copying of this file, via any medium is strictly prohibited
Proprietary and confidential