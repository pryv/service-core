
The way it works 

# Concepts 
### "Store Properties" 
To be discussed, either this is exposed or we create specific error when something unsupported is done on the storage
**preffered would be to send error messages** (for the 1st iteration)
- supportsAttachments 'no', 'single', 'multiple'
- supportsEventStreaming true / false
- supportsSeries true / false
- supportsStreamsClientData
- supportsEventsClientData


### "StreamdIds" 
- localStorage is unchanged
- dynamic or "mounted" sources have a "root" stream that starts with a "." 
- to ensure non-collision dynamic sources streamiD will be namespaced with their root id by service-core
  Example ".account/email" for "email" stream exposed by "account" data source

### "Stream Lists" `streams.get`
- To avoid exposing full stream structure or querying too often remote ressources. We might not expose other storage than localStorage stream unless expecitely specified. Then we need to provide a "discovery" mechnanism for this streams like
  exemple: `stream.get()` could return 
  ```
  [{
    id: '.account',
    children-hidden: true,
   },
   {
     id: 'diary', 
     ....
   }

  ]
  ``` 
  exemple: `stream.get({parentIds: ['*', '.account']})` would return all streams and `.account` substreams

#### stream.get new Parameter `parentIds`
- In order to explore stores streams, parentIds would replace parentId:
- It would accept ['.*', '*'] to get all `cachable` streams 
- To avoid duplicate or stream tree consolidation, Only one streamId per scope can be specified otherwise => error


### Event association to stores
- Events ids will not be sufficient in a "multi-storage" set-up 
  - No way to do a "delete" or "update" without knowing the storage it applies. 
  - We then introduce 'namespacing' of event id to their store eg: id: '.account-cjhsadhasjhdajsasd' 
    Note: this would break 'cuid' checks 

- Moving an event from one to the other is not possible without changing its id.. 
  - So "events.update" should either accept id updates or we just let the dev to a create / delete 

### Multiple streams limitations
- Multiple streams between data-source need a data-source of "reference" as the event will not be copied "twice"
  - This could be achieved if the reference store supports multiple streams and other stores supports event-references
    ex: `{event: { id: '.account-c1111', streamIds: ['.account-username', 'private'] } }`
    then a reference event could be stored in the stream 'private' of localStorage with `{reference: '.account-c1111'}`
  - The proposal will induce a lot of overheads if the content of the event is not fully copied (ex fromTime toTime query)
- At 1st step I propose to throw a new Error `multiple-streams-cross-store-not-supported`

- **StreamQuery** 'blocks' will be supported on a "per storage" basis.
  - A Query { any: ['.account', 'diary']}

### Streams and exploration of non cachable structures
- Some streams structures might not be available or too big to be fully stored or cached (e.g. a file system)
  - Add a new property to streams: 'nonCachableChildrens: true" to indicate (some) childrens cannot be cached.
    **Alternative** add a 'containsNonCachableChildrens' item in the chidren list <= not preffered
  - 'nonCachable' property is added to streams that cannot be cached.
  - 'nonCachable' substreams are 'nonCachable' 
  - To be sure we can give ACR to a nonCachable stream: 
    ids of nonCachable streams must include full path to reach them e.g. id of "Documents" `.filesystem-root/User/tom/Documents` 
    This implies that if "Documents" is moved then its id changes. 

**Note:**
  - streams.get({parentId:[...]}) should include the streamId to get the childrens.
  - a new parameters 'includeNonCachable: true' might be introduce (could produce huge amount of data) 

### Defaults and unknown values
- For some Stores, some value are unkown for example 'createdAt' or 'modifiedBy' 
  - in this case the value is explicitely set to 'UNKOWN' <== and we have to make it a protected word
  - Question (what to do for numerical values) ? and for example 'modifiedSince' ? 

### "Caching permissions per access" for non cachable Streams
Out of scope but still relevant to check that the logic can allow optimistation

To have fast check of permissions per access we could cache the following table
              
{streamid} | streams.get | streams.create | streams.update | events.get | events.create | events.update

```
For non-cachable stream eg.
.filesystem-root/User/tom | true | true .... 

When a events.get is done on .filesystem-root/User/tom/Documents 
// 1- check it's non cachable 
// 2- loop the "path" recusrively 
function getRightsNonCachable(streamId) {
  const path = streamId.split('/');
  do {
    const rights = rights[path.join('/)];
    if (rights) return rights;
    path.pop();
  } while(path.length > 0);
  return null;
}

// return the rights for a stream
function getRights(streamId) { }

getRights('.filesystem-root/User/tom/Documents');

```

### List of new errors

- multiple-streams-cross-store-not-supported 
- ressource-is-readonly: when rights has been granted to 
- feature-no-supported-by-store: generic error for attachments, series (could even be used for read-only) 