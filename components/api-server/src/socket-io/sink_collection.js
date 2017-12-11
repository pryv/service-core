// @flow

// A consumer for our kind of (change) messages. 
// 
export interface MessageSink {
  deliver(userName: string, message: string): void; 
}

// SinkCollection holds a list of MessageSinks and distributes messages to all 
// sinks added via `addSink`. It purely does 1:n messaging and nothing else. 
//
class SinkCollection implements MessageSink {
  // NOTE Yes, this is the EventEmitter pattern. I choose not to use that class
  //  as a basis since it will not allow type checking. 
  sinks: Array<MessageSink>;
  
  constructor() {
    this.sinks = [];
  }
  
  // Adds a sink to distribute to. 
  // 
  addSink(sink: MessageSink) {
    this.sinks.push(sink);
  }
    
  // Delivers to all sinks.
  //
  deliver(userName: string, message: string): void {
    for (const sink of this.sinks) {
      sink.deliver(userName, message);
    }
  }
}
module.exports = SinkCollection;