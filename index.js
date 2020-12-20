/**********************************************************************
 * Copyright 2020 Paul Reeve <preeve@pdjr.eu>
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you
 * may not use this file except in compliance with the License. You may
 * obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
 * implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

const Log = require("./lib/signalk-liblog/Log.js");
const Schema = require("./lib/signalk-libschema/Schema.js");
const Nmea2000 = require("./lib/signalk-libnmea2000/Nmea2000.js");

const PLUGIN_SCHEMA_FILE = __dirname + "/schema.json";
const PLUGIN_UISCHEMA_FILE = __dirname + "/uischema.json";

module.exports = function(app) {
  var plugin = {};
  var unsubscribes = [];
  var switchbanks = {};

  plugin.id = "switchbank";
  plugin.name = "Switch bank interface";
  plugin.description = "Operate N2K relay output switch banks.";

  const log = new Log(plugin.id, { ncallback: app.setPluginStatus, ecallback: app.setPluginError });

  plugin.schema = function() {
    var schema = Schema.createSchema(PLUGIN_SCHEMA_FILE);
    return(schema.getSchema());
  };

  plugin.uiSchema = function() {
    var schema = Schema.createSchema(PLUGIN_UISCHEMA_FILE);
    return(schema.getSchema());
  }

  plugin.start = function(options) {
    log.N("operating %d switch banks (%d relay banks)", options.switchbanks.length, options.switchbanks.filter(sb => (sb.type == "relay")).length);

    /******************************************************************
     * Harvest documentary data from the defined switchbanks and write
     * it to the Signal K tree as meta information for each of the
     * specified switch channel paths.
     */

    var flattenedChannels = options.switchbanks.reduce((a,sb) => a.concat(sb.channels.map(ch => { return({"instance": sb.instance, "index": ch.index, "type": sb.type, "description": ch.description })})), []);
    var deltas = flattenedChannels.map(c => ({
      "path": "electrical.switches.bank." + c.instance + "." + c.index + ".meta",
      "value": { "name": c.description, "type": c.type }
    }));
    app.handleMessage(plugin.id, makeDelta(plugin.id, deltas));

    /******************************************************************
     * NMEA switchbanks are updated with aggregate state information
     * for every contained channel. Consequently, we need to keep track
     * of relay switchbank channel states so that we can easily make an
     * update message when we need to.
     */

    options.switchbanks.filter(sb => (sb.type == "relay")).forEach(switchbank => {
      let instance = switchbank.instance; 
      var maxindex = switchbank.channels.reduce((a,c) => ((c.index > a)?c.index:a), 0);
      app.debug("creating relay state model for switchbank %d (%d channels)", instance, (maxindex + 1)); 
      switchbanks[instance] = (new Array(maxindex)).fill(undefined);
      for (var i = 0; i < switchbank.channels.length; i++) {
        let channel = switchbank.channels[i].index;
        let stream = app.streambundle.getSelfStream("electrical.switches.bank." + instance + "." + channel + ".state");
        let description = switchbank.channels[i].description;
        if (stream) stream.skipDuplicates().onValue(v => {
          switchbanks[instance][channel - 1] = v;
          app.debug("updating relay state model [%d,%d] = %d (%s)", instance, (channel - 1), v, description);
        });
      }
    });

    /******************************************************************
     * Register a put handler for all switch bank relay channels.
     */

    var controlPaths = options.switchbanks.filter(sb => (sb.type == "relay")).reduce((a,sb) => a.concat(sb.channels.map(ch => "electrical.switches.bank." + sb.instance + "." + ch.index + ".state")), []);
    controlPaths.forEach(path => app.registerPutHandler('vessels.self', path, actionHandler, plugin.id));
  }

  plugin.stop = function() {
	unsubscribes.forEach(f => f());
	unsubscribes = [];
  }

  /********************************************************************
   * Process a put request for switchbank state change. Signal K does
    not pass a handle to the request source and since we want to
   * process requests emanating from physical switches differently to
   * requests emanating from virtual devices, we need a work-around.
   *
   * So, we extend what constitutes a value (normally 0 or 1) to allow
   * values 2 and 3 for virtual OFF and ON.
   */
  
  function actionHandler(context, path, value, callback) {
    app.debug("processing put request (path = %s, value = %s)", path, value);
    var parts = path.split('.') || [];
    var buffer = Array.from(switchbanks[parts[3]]).map(v => (v === undefined)?0:v);
    var setValue = (value & 0x01);
    switch (value) {
      case 0: // OFF request from switch
        break;
      case 1: // ON request from switch
        break;
      case 2: // OFF request from virtual switch
        value = 0;
        break;
      case 3: // ON request from virtual switch
        value = 1;
        break;
      default:
        break;
    }
    buffer[parts[4] - 1] = ((value)?1:0);
    message = Nmea2000.makeMessagePGN127502(parts[3], buffer);
    app.emit('nmea2000out', message); app.emit('nmea2000out', message);
    log.N("transmitting NMEA message '%s'", message);
    return({ state: 'COMPLETED', statusCode: 200 });
  }

  /********************************************************************
   * Return a delta from <pairs> which can be a single value of the
   * form { path, value } or an array of such values. <src> is the name
   * of the process which will issue the delta update.
   */

  function makeDelta(src, pairs = []) {
    pairs = (Array.isArray(pairs))?pairs:[pairs]; 
    return({
      "updates": [{
        "source": { "type": "plugin", "src": src, },
        "timestamp": (new Date()).toISOString(),
        "values": pairs.map(p => { return({ "path": p.path, "value": p.value }); }) 
      }]
    });
  }

  return(plugin);
}
