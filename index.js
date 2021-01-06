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

const Delta = require("./lib/signalk-libdelta/Delta.js");
const Log = require("./lib/signalk-liblog/Log.js");
const Schema = require("./lib/signalk-libschema/Schema.js");
const Nmea2000 = require("./lib/signalk-libnmea2000/Nmea2000.js");

const PLUGIN_SCHEMA_FILE = __dirname + "/schema.json";
const PLUGIN_UISCHEMA_FILE = __dirname + "/uischema.json";
const PLUGIN_METADATA_KEY = "notifications.plugins.switchbank.metadata";

module.exports = function(app) {
  var plugin = {};
  var unsubscribes = [];
  var switchbanks = {};

  plugin.id = "pdjr-skplugin-switchbank";
  plugin.name = "N2K switch bank interface";
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

    var metadata = [];
    options.switchbanks.forEach(switchbank => {
      if (switchbank.description) {
        //metadata.push({ key: "electrical.switches.bank.", description: "Instance number of N2K switchbank (range 0 - 254)" }); 
        //metadata.push({ key: "electrical.switches.bank." + switchbank.instance, description: switchbank.description });
      }
      if (switchbank.channels) {
        switchbank.channels.forEach(channel => {
          var meta = {
            key: "electrical.switches.bank." + switchbank.instance + "." + channel.index + ".state",
            description: "Binary " + switchbank.type + " state (0 = OFF, 1 = ON)",
            type: switchbank.type
          };
          meta.shortName = "[" + switchbank.instance + "," + channel.index + "]"
          meta.displayName = channel.description || meta.shortName;
          meta.longName = meta.displayName + " " + meta.shortName;
          metadata.push(meta);
        });
      }
    });
    log.N("saving metadata to '%s' (%d items)", PLUGIN_METADATA_KEY, metadata.length);
    (new Delta(app, plugin.id)).addValue(PLUGIN_METADATA_KEY, metadata).commit().clear();
    
    /******************************************************************
     * NMEA switchbanks are updated with aggregate state information
     * for every contained channel. Consequently, we need to keep track
     * of relay switchbank channel states so that we can easily make an
     * update message when we need to.
     */

    options.switchbanks.filter(sb => (sb.type == "relay")).forEach(switchbank => {
      let instance = switchbank.instance; 
      var maxindex = switchbank.channelcount;
      app.debug("creating relay state model for switchbank %d (%d channels)", instance, maxindex); 
      switchbanks[instance] = (new Array(maxindex)).fill(undefined);
      for (var i = 1; i <= maxindex; i++) {
        let channel = i;
        let stream = app.streambundle.getSelfStream("electrical.switches.bank." + instance + "." + channel + ".state");
        if (stream) stream.filter((v) => ((!isNaN(v)) && ((v === 0) || (v === 1)))).skipDuplicates().onValue(v => {
          switchbanks[instance][channel - 1] = v;
          app.debug("updating relay state model [%d,%d] = %d", instance, channel, v);
        });
      }
    });

    /******************************************************************
     * Register a put handler for all switch bank relay channels.
     */

    options.switchbanks.filter(sb => (sb.type == "relay")).forEach(sb => {
      for (var ch = 1; ch <= sb.channelcount; ch++) {
        var path = "electrical.switches.bank." + sb.instance + "." + ch + ".state";
        app.registerPutHandler('vessels.self', path, actionHandler, plugin.id);
      }
    });

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
    if ((!isNaN(value)) && ((value === 0) || (value === 1) || (value === 2) || (value === 3))) {
      value = (value & 0x01);
      buffer[parts[4] - 1] = value;
      message = Nmea2000.makeMessagePGN127502(parts[3], buffer);
      app.emit('nmea2000out', message); app.emit('nmea2000out', message);
      log.N("transmitting NMEA message '%s'", message);
    } else {
      log.E("invalid value (%s) in put request", value);
    }
    return({ state: 'COMPLETED', statusCode: 200 });
  }

  return(plugin);
}
