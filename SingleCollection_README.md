# Single Collections Mode - Notes

Goal is to get rid of {userid}.{object} collections and have one single collection per object.

We can distinguish 3 different tasks

1. **#addUserId** for all document adds a userId property to isolate per-user document

   1. add userId to indexes
   2. add userId to all incoming data
   3. add userId to all queries
   4. remove userId from outgoing response

2. **#useStreamIds** for object that have non cuid items (Streams)

   Note: The very same logic has been applied to **Profile**

   1. let mongo generate `_id` property and convert `id` to `StreamId`
      - for incoming data
      - for queries
   2. convert back for responses

3. **#deleteToNull** for Streams (and mabe other) indexes as 

   ```javascript
    index: { name: 1, parentId: 1 },
    options: { unique: true, sparse: true }
   ```

   Where working previously,

   By introducing `userId` in indexes

   ```javascript
    index: { userId: 1, name: 1, parentId: 1 },
    options: { unique: true, partialFilterExpression: {
         deleted: { $type: 'null'}
    }
   ```

   `sparse `option was not usable and filtering was made `deleted` property.

   As it is not possible to use the `{ $exists: false}` filter, I force all items to have a deleted property (set to null) if none. 

   This **Hack** does not satisfy me!! 

### Streams, Events, ..

For all Objects that were splitted in different collections. Single Collection Mode is activated by having `getCollectionInfo(user)`returning an object with `useUserId = {userId}`property

```javascript
Streams.prototype.getCollectionInfo = function (user) {
  return {
    name: 'streams',
    indexes: indexes,
    useUserId: user.id
  };
}; 
```

### Database

- for all collections' indexes add userId if `collectionInfo.useUserId` params exists **#addUserId**

  ```javascript
  if (collectionInfo.useUserId) {
          for (var i = 0; i < collectionInfo.indexes.length; i++) {
            collectionInfo.indexes[i].index.userId = 1;
          }
        }
  ```

  Question: Order seems to be important: https://docs.mongodb.com/manual/core/index-compound/#create-a-compound-index

  *The order of the fields listed in a compound index is important. The index will contain references to documents sorted first by the values of the `item` field and, within each value of the `item` field, sorted by values of the stock field.*

  Even if order is not warrantied in Object, we should add   `userId` at 1st position

  

- For all methods with a query, `addUserIdIfneed`is called **#addUserId** ****

  ```javascript
    /**
     * Add User Id to Object or To all Items of an Array
     *
     * @param collectionInfo
     * @param {Object|Array} mixed
     */
    addUserAndSoftIdIfneed(collectionInfo: CollectionInfo, mixed, infos) {
  
      function addUserIdProperty(object) {
        object.userId = collectionInfo.useUserId;
      }
      
      if (collectionInfo.useUserId) {
        if (mixed.constructor === Array) {
          for (var i = 0; i < mixed.length; i++) {
            addUserIdProperty(mixed[i]);
          }
        } else {
          addUserIdProperty(mixed);
        }
      }
  
  
     // infos = infos || '#';  console.log('=>> [' + collectionInfo.name +']- ' + infos + ' ', mixed, 'end');
    };
  
  
  ```

  Note: this has not be implemented in converters, as they do not have access to the `userId`

  

- Specfic case of `countAll` returns now document count 

  ```javascript
  if (collectionInfo.useUserId) {
        return this.count(collectionInfo, {}, callback);
      }
  ```

  

- Specifc case of `totalSize` return now document count, as there is no way to have size per user 

  ```javascript
  if (collectionInfo.useUserId) {
        this.countAll(collectionInfo, callback);
        return;
      }
  ```

- Specific case `dropCollection` drop all documents related to this userId

  ```javascript
   if (collectionInfo.useUserId) {
        this.deleteMany(collectionInfo, {}, callback);
        return;
      }
  ```




### Base Storage

- `findDeletion`passed modified search query **#deleteToNull**
  from `query.deleted = { $exists: true };`
  to `query.deleted = { $ne: null };`

- `applyConvertersFromDB`removing all occurences of **userId** **#addUserId**

  ```javascript
  function applyConvertersFromDB(object, converterFns) {
    if (object) {
      if (object.constructor == Array) {
        for (var i = 0; i < object.length; i++) {
          if (object[i].userId) {
            delete object[i].userId;
          }
        }
      } else {
        if (object.userId) {
          delete object.userId;
        }
      }
    };
    return applyConverters(idFromDB(object), converterFns);
  }
  ```

  Note: this could be moved to some converters

### Events related modification

 - **for findStream** in `ApplyEventsFromDbStream` **#deleteToNull**

   ```
   delete event.userId; // delete all event.userId found
       if (event.deleted == null) { // due to the global change involved
         delete event.deleted;
       }
   ```


### Streams



- Modification of the index options for **#deleteToNull**

  ```javascript
  index: { streamId: 1, options: {unique: true} },   
  index: { name: 1, parentId: 1 },
      options: { unique: true, partialFilterExpression: {
        deleted: { $type: 'null'}
      } }
  ```

- Converters

- ```javascript
  _.extend(this.converters, {
   ...
    itemToDB: [
      idToStreamId,
      converters.deletionToDB,
      converters.stateToDB
    ],
   ...
    queryToDB: [idToStreamId],
   ...
    itemFromDB: [streamIdToId, converters.deletionFromDB],
  });
  ```

```javascript

function idToStreamId(item) {
  if (item && item.id) {item.streamId = item.id; delete item.id;}
  return item;
}

function streamIdToId(item) {
  if (item) {
    delete item.id;
    if (item.streamId) {item.id = item.streamId;  delete item.streamId;}
  }
  return item;
}
```



- Check for `if (storage.Database.isDuplicateError(err)) {`has been modified

- ```javascript
  const apiError = err.message.indexOf('streamId_1_userId_1') > 0
  ```


### FollowedSlices

- An error on Creation Or Update was detected by matching constraints message from MongoDb. As we change the indexes by adding `userId` the message changed. Code was addapted to:

```javascript
  /**
   * Returns the error to propagate given `dbError` and `params` as input. 
   */
  function getCreationOrUpdateError(dbError, params) {
    ... 
    const nameKeyDuplicate = message.match(/index: name_1_userId_1 dup key:/);
    ....
  }
```

Note: This must be changed manually if indexes order is changed as proposed before.

### Converters 

- For **#deleteToNull** I/O for deletion have been modified

  IN: set `deleted = null`for all items 

  ```javascript
  exports.deletionToDB = function (item) {
    if (item.deleted) {
      item.deleted = timestamp.toDate(item.deleted);
    } else {
      item.deleted = null;
    }
    return item;
  };
  ```

  OUT: remove all `deleted == null` from result

  ```javascript
  exports.deletionFromDB = function (dbItem) {
    if (! dbItem) { return dbItem; }
  
    if (dbItem.deleted == null) {
      delete dbItem.deleted;
    }
  
  ...
  ```

  Note: As this only involves **Streams** to filer could be more specific to avoid side effects on other objects.

  


