
// @flow

export interface MessageSink {
  deliver(userName: string, message: string): void; 
}

type User = { username: string };

// ChangeNotifier distributes messages from the Notifications bus to both
// socket.io clients in this process (by delivering to Manager directly) and 
// to socket.io clients in other processes (by sending the messages to the 
// NATS server). Note that this is a description of the use we make of this 
// class, technically all the consumers (sinks) implement the `MessageSink`
// interface. 
// 
// Translation from Notifications bus messages ('events-changed') to socket.IO
// messages ('eventsChanged') also happens here. 
//
class ChangeNotifier implements MessageSink {
  // NOTE Yes, this is the EventEmitter pattern. I choose not to use that class
  //  as a basis since it will not allow type checking. 
  sinks: Array<MessageSink>;
  
  constructor() {
    this.sinks = [];
  }
  
  addSink(sink: MessageSink) {
    this.sinks.push(sink);
  }
  
  // Listens to messages that are of interest to us and forward them to 
  // #extractAndDeliver.
  //
  listenTo(notificationBus: EventEmitter) {
    const messageMap = [
      ['accesses-changed', 'accessesChanged'],
      ['events-changed', 'eventsChanged'],
      ['streams-changed', 'streamsChanged'],
    ];
    
    for (const [from, to] of messageMap) {
      notificationBus.on(from, 
        (user) => this.extractAndDeliver(to, user));
    }
  }
  
  // Extracts information from the user object and #delivers the message. 
  // 
  extractAndDeliver(msgName: string, user: User) {
    const userName = user.username;
    
    this.deliver(userName, msgName);
  }
  
  // Delivers to all sinks.
  //
  deliver(userName: string, message: string): void {
    for (const sink of this.sinks) {
      sink.deliver(userName, message);
    }
  }
}
module.exports = ChangeNotifier;
