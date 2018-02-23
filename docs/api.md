# API Concepts 

## Events

Events are the primary units of content in Pryv. An event is a timestamped piece of typed data, possibly with one or more attached files, belonging to a given context. Depending on its type, an event can represent anything related to a particular time (picture, note, location, temperature measurement, etc.).

The API supports versioning, allowing to retrieve all previous versions of a specific event, necessary for audit activities. It is also possible for events to have a duration to represent a period instead of a single point in time, and the API includes specific functionality to deal with periods.

See also [standard event types](http://api.pryv.com/event-types/#directory).

|            |                                                              |
| ---------: | ------------------------------------------------------------ |
|       `id` | [identifier](http://api.pryv.com/reference/#data-structure-identifier) (readonly, unique) -  The identifier ([collision-resistant cuid](https://usecuid.org/)) for the event. Automatically generated if not set when creating the event. |
| `streamId` | [identifier](http://api.pryv.com/reference/#data-structure-identifier) - The id of the belonging stream. |
|     `time` | [timestamp](http://api.pryv.com/reference/#data-structure-timestamp) -  The event's time. For period events, this is the time the event started. |
| `duration` |                                                              |
|     `type` | string -  The type of the event. See the [event type directory](http://api.pryv.com/event-types/#directory) for a list of standard types. If the event is a high frequency series, the type starts with the prefix 'series:'. |
|  `content` | any (optional) -  The `type`-specific content of the event, if any. Leave empty if this event is a series event. |

## Series

Series are collections of homogenous data points. They should be used instead of events where the structure of the data doesn't change and you expect a high volume of data at possibly high speeds (O(1Hz)).

Each data point in a series has a `"timestamp"` field containing the timestamp for the data point. For [types](http://api.pryv.com/event-types/#directory) that store a single value (like "mass/kg") they contain a single additional field called `"value"`. Types that contain multiple fields (like "position/wgs84") will possibly have many fields, whose name can be inferred from the [type reference](http://api.pryv.com/event-types/#position). In the above example ("position/wgs84") there would be the fields `"latitude"`, `"longitude"` and possibly one of the optional fields `"altitude"`, `"horizontalAccuracy"`, `"verticalAccuracy"`, `"speed"`, `"bearing"`.

Series data can be encoded in transit in one of the following data formats.

### Format "flatJSON"

A single data point for the type "position/wgs84" would be encoded as follows: 

~~~json
{
    "format": "flatJSON", 
    "fields": ["timestamp", "latitude", "longitude", "altitude"], 
    "points": [
        [1519314345, 10.2, 11.2, 500]
    ]
}
~~~

The `"fields"` array lists all the fields that you will be submitting, including the "timestamp" field. 

The `"points"` array contains all the data points you'd like to submit. Each data point is represented by a simple array. This makes the bulk of the message (your data points) very space-efficienty; values are encoded positionally. The first value corresponds to the first field, and so on. 

Whenever possible, you should submit multiple data points in a single API call to Pryv, as follows (For example when sampling the height of a drone that is in rapid ascension):

~~~json
{
    "format": "flatJSON", 
    "fields": ["timestamp", "latitude", "longitude", "altitude"], 
    "points": [
        [1519314345, 10.2, 11.2, 500], 
        [1519314346, 10.2, 11.2, 510],
        [1519314347, 10.2, 11.2, 520],
    ]
}
~~~

# API Endpoints

## Events

### Create Event

|      |                 |
| ---- | --------------- |
| id   | `events.create` |
| HTTP | POST /events    |

Records a new event. It is recommended that events recorded this way are completed events, i.e. either period events with a known duration or mark events. To start a running period event, use [Start period](http://api.pryv.com/reference/#methods-events-events-start) instead.

In addition to JSON, this request accepts standard multipart/form-data content to support the creation of event with attached files in a single request. When sending a multipart request, one content part must hold the JSON (application/json) for the new event and all other content parts must be the attached files.

To create an event that can hold high frequency series data, you will need to specify a `type` field that starts with the string "series:" and that ends with any valid Pryv data type, e.g: `"series:mass/kg"`. Leave the `content` field empty to create such a series - it will automatically be populated with meta data on the series. 

#### PARAMETERS

The new event's data: see [Event](http://api.pryv.com/reference/#data-structure-event).

#### RESULT

`HTTP 201 Created` 

|           |                                                              |
| --------- | ------------------------------------------------------------ |
| event     | [event](http://api.pryv.com/reference/#data-structure-event) - The created [event](http://api.pryv.com/reference/#data-structure-event). |
| stoppedId | [identifier](http://api.pryv.com/reference/#data-structure-identifier) - Only in `singleActivity` streams. If set, indicates the id of the previously running period event that was stopped as a consequence of inserting the new event. |

#### ERRORS

| Status | Error Code            |                                                              |
| ------ | --------------------- | ------------------------------------------------------------ |
| 400    | `"invalid-operation"` | The referenced stream is in the trash, and we prevent the recording of new events into trashed streams. |
| 400    | `"periods-overlap"`   | Only in `singleActivity` streams: the new event overlaps existing period events. The overlapped events' ids are listed as an array in the error's `data.overlappedIds`. |

## High Frequency Series

### Append Data to a Series Event

|      |                                  |
| ---- | -------------------------------- |
| HTTP | `POST /events/{event_id}/series` |

Appends new data to a series event. 

#### PARAMETERS

|          |                      |
| -------: | -------------------- |
| event_id | The id of the event. |

#### BODY

Your data should be formatted as series data in the 'flatJSON' format. 



#### RESULT

`HTTP 201 Created` 

|           |                                                              |
| --------- | ------------------------------------------------------------ |
| event     | [event](http://api.pryv.com/reference/#data-structure-event) - The created [event](http://api.pryv.com/reference/#data-structure-event). |
| stoppedId | [identifier](http://api.pryv.com/reference/#data-structure-identifier) - Only in `singleActivity` streams. If set, indicates the id of the previously running period event that was stopped as a consequence of inserting the new event. |

#### ERRORS

| Status | Error Code            |                                                              |
| ------ | --------------------- | ------------------------------------------------------------ |
| 400    | `"invalid-operation"` | The referenced stream is in the trash, and we prevent the recording of new events into trashed streams. |
| 400    | `"periods-overlap"`   | Only in `singleActivity` streams: the new event overlaps existing period events. The overlapped events' ids are listed as an array in the error's `data.overlappedIds`. |