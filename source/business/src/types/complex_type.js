// @flow

import type {EventType, PropertyType} from './interfaces';

type JSONSchema = {
  type: string, 
  properties?: {}, 
  required?: Array<string>,
}

const assert = require('assert');
const R = require('ramda');

// A complex type like 'position/wgs84' that has several subfields. 
// 
class ComplexType implements EventType {
  schema: JSONSchema;
  
  constructor(schema: JSONSchema) {
    // We only handle this kind of schema
    assert.ok(schema.type === 'object'); 
    
    // Complex types have a list of required fields and a schema for the object
    // properties: 
    assert.ok(schema.required != null, 
      'Type Schema must have a list of required fields.'); 
    assert.ok(schema.properties != null, 
      'Type Schema must have a properties object.');   
    
    this.schema = schema; 
  }
  
  requiredFields() {
    if (this.schema.required == null) 
      throw new Error('Type Schema must have a list of required fields.');
      
    return this.schema.required; 
  }
  optionalFields() {
    const requiredKeys = this.requiredFields();

    if (this.schema.properties == null) 
      throw new Error('Type Schema must have a properties object.');
    const allKeys = Object.keys(this.schema.properties); 
    
    return R.reject(
      (el) => R.indexOf(el, requiredKeys) >= 0,
      allKeys);
  }
  
  forField(name: string): PropertyType {
    // TODO
    return new BasicType('number'); 
  }
}

module.exports = ComplexType;