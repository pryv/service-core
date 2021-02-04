const {DataSource, UserStreams}  = require('../interfaces/DataSource');

const StreamsUtils = require('./lib/StreamsUtils');

/**
 * Handle Store.streams.* methods
 */
class StoreUserStreams extends UserStreams {
 
  constructor(main) {
    super();
    this.main = main;
  }

  async get(uid, params) {
    let res = [];

    // *** root query we just expose stores handles
    if (! params.streamIds) { 
      for (let source of this.main.sources) {
        res.push([StreamsUtils.sourceToStream(source, {
          children: [],
          childrenHidden: true // To be discussed
        })]);
      }
      return res;
    }

    // *** forward query to included stores (parallel)

    const flags = {}; 
    let addSourceRoot = false;

    // get storages involved from streamIds 
    for (let streamId of params.streamIds) {

      if (streamId.indexOf('.') === 0) { // fatest method against startsWith or charAt() -- 10x
        
        if (streamId === '.*') {   // if '.*' add all sources
          for (let source of this.main.sources) {
            flags[source.id] = true;
          }
          addSourceRoot = true;

        } else {  // add streamId's corresponding source 
          const sourceId = streamId.substr(1, streamId.indexOf('-') - 1); // fastest against regexp and split 40x
          if (! flags[sourceId]) {
            flags[sourceId] = true;
            if (! this.main.sourcesMap[sourceId]) {
              DataSource.errorUnkownRessource('DataSource [' + sourceId + '] unkown in streamIds query parameters', params);
            } 
          }
        }
      }
    }

    const tasks = [];
    const sourceIds = Object.keys(flags);
    for (let sourceId of sourceIds) {
      tasks.push(this.main.sourcesMap[sourceId].streams.get(uid, params));
    }

    // call all sources
    const sourcesRes =  await Promise.allSettled(tasks);

    // check results and eventually replace with error (non blocking unavailable ressource)
    for (let i = 0; i < sourceIds.length; i++) {
      if (sourcesRes[i].status === 'fulfilled') {
        if (! addSourceRoot) {
          res.push(...sourcesRes[i].value); // add all items to res
        } else {
          const source = this.main.sourcesMap[sourceIds[i]];
          res.push([StreamsUtils.sourceToStream(source, {
            children: sourcesRes[i].value
          })]);
        }
      } else {
        const source = this.main.sourcesMap[sourceIds[i]];
        res.push([StreamsUtils.sourceToStream(source, {
          unreachable: sourcesRes[i].reason
        })]);
      }
    }
    return res;
  }
}

module.exports = StoreUserStreams;