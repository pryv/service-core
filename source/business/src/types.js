// @flow

module.exports = {
  lookup: lookupTypeFromName, 
};

const assert = require('assert');

interface Type {
  forField(name: string): Type; 
  coerce(value: any): any; 
}

class BasicType {
  typeName: string; 
  
  constructor(typeName: string) {
    this.typeName = typeName;
  }
  
  forField(name: string): Type {
    // NOTE BasicType only represents types that are not composed of multiple 
    // fields. So the name MUST be 'value' here. 
    assert.ok(name === 'value');
    
    return this;
  }
  
  coerce(value: any): any {
    return value; 
  }
}

function lookupTypeFromName(name: string): Type {
  if (name === 'mass/kg') {
    return new BasicType('number');
  }
  
  throw new Error('Please: Implement composed types.');
}

