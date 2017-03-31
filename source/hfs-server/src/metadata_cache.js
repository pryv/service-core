// @flow

export interface MetadataRepository {
  forSeries(eventId: string, accessToken: string): SeriesMetadata;
}

/** Holds metadata related to series for some time so that we don't have to 
 * compile it every time we store data in the server. 
 * 
 * Caches data about a series first by `accessToken`, then by `eventId`. 
 * */
class MetadataCache implements MetadataRepository {
  loader: MetadataLoader;
  
  constructor(metadataLoader: MetadataLoader) {
    this.loader = metadataLoader;
  }
  
  forSeries(eventId: string, accessToken: string): SeriesMetadata {
    // TODO implement caching
    return this.loader.forSeries(eventId, accessToken); 
  }
}

/** Loads metadata related to a series from the main database. 
 */
class MetadataLoader {
  forSeries(eventId: string, accessToken: string): SeriesMetadata {
    return new SeriesMetadata(); 
  }
}

/** Metadata on a series, obtained from querying the main database. 
 *
 * NOTE Instances of this class get stored in RAM for some time. This is the
 *  reason why we don't store everything about the event and the user here, 
 *  only things that we subsequently need for our operations. 
 */
class SeriesMetadata {
  canWrite(): boolean {
    return false; 
  }
}

module.exports = {
  MetadataLoader: MetadataLoader, 
  MetadataCache: MetadataCache,
};
