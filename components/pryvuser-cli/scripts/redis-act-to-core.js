// edit redis :server entries from act to appropiate core
// artur

var redis = require("redis");
var client = redis.createClient(6379, '127.0.0.1');
client.auth('MyRecordedLife')

client.on("error", function (err) {
    console.log("Error " + err);
    });

function print_results(obj) {
    console.dir(obj);
}

client.keys("*:server", function (err, all_keys) {
    all_keys.forEach(function (key, pos) { // use second arg of forEach to get pos
      client.get(key, function(err, reply) {
          if (err) console.log(err);
          else {
            console.log(reply);
            newval = null;
            if (reply == "act-gandi-fr-01.pryv.net") newval = "core-gandi-fr-01.pryv.net";
            else if (reply == "act-swisscom-ch-01.pryv.net") newval = "core-exoscale-ch-01.pryv.net";
            else if (reply == "act-gandi-us-01.pryv.net") newval = "core-gandi-us-01.pryv.net";
            else if (reply == "act-joyent-usw-01.pryv.net") newval = "core-gandi-us-02.pryv.net";
            else if (reply == "act-fengqi-hk-01.pryv.net") newval = "core-fengqi-hk-01.pryv.net";
            else { newval= null; console.log("ERROR: unknown ignoring") }

            if (newval != null) client.set(key, newval);
          }
      });
    });
      console.log('done!');
});

