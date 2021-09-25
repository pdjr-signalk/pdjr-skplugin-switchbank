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

const net = require('net');
const fs = require('fs');
const Delta = require("./lib/signalk-libdelta/Delta.js");
const Log = require("./lib/signalk-liblog/Log.js");
const Schema = require("./lib/signalk-libschema/Schema.js");
const Nmea2000 = require("./lib/signalk-libnmea2000/Nmea2000.js");

const PLUGIN_ID = "switchbank";
const PLUGIN_NAME = "N2K switch bank interface";
const PLUGIN_DESCRIPTION = "N2K switch bank interface";

const PLUGIN_SCHEMA_FILE = __dirname + "/schema.json";
const PLUGIN_UISCHEMA_FILE = __dirname + "/uischema.json";

module.exports = function(app) {
  var plugin = {};
  var unsubscribes = [];
  var switchbanks = {};

  plugin.id = PLUGIN_ID;
  plugin.name = PLUGIN_NAME;
  plugin.description = PLUGIN_DESCRIPTION;

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
    var channelCount = 0;

    if (options) {
      if (options.switchbanks) {
        channelCount = options.switchbanks.reduce((a,sb) => { return(a + ((sb.channels)?sb.channels.length:0)); }, 0);
        if (channelCount) {
          log.N("Processing %d channel%s in %d switch bank%s", channelCount, ((channelCount == 1)?"":"s"), options.switchbanks.length, (options.switchbanks.length == 1)?"":"s");

          /******************************************************************
           * If options.metainjectorfifo is defined then harvest documentary
           * data from any defined switchbanks and write it to metadata
           * injector service on the defined FIFO.
           */

          if (options.metainjectorfifo) {
            if (fs.existsSync(options.metainjectorfifo)) {
              var recordsOut = exportMetadata(options.metainjectorfifo, options.switchbanks);
              log.N("%d metadata records sent to injector service at '%s'", recordsOut, options.metainjectorfifo);
            } else {
              log.N("skipping meta data output because configured FIFO (%s) does not exist", options.metainjectorfifo);
            }
          } else {
            log.N("skipping meta data output because FIFO is not configured");
          }

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
      }
    }
  }

  plugin.stop = function() {
	unsubscribes.forEach(f => f());
	unsubscribes = [];
  }

  function exportMetadata(fifo, switchbanks) {  
    var metadata = [];
    switchbanks.forEach(switchbank => {
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
          meta.timeout = 10000;
          metadata.push(meta);
        });
      }
    });
    if (metadata.length) {
      var client = new net.Socket();
      client.connect(fifo);
      client.on('connect', () => {
        client.write(JSON.stringify(metadata));
        client.end();
      });
    }
    return(metadata.length);
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
    if (((!isNaN(parts[3])) && (!isNaN(parts[4])) && (!isNaN(value))) // instance, channel and value are numeric
    && ((parts[3] >= 0) && (parts[3] <= 0xFE)) // instance is valid (in range 0..254)
    && ((parts[4] >= 1) && (parts[4] <= 28)) // channel is valid (in range 1..28)
    && ((value === 0) || (value === 1) || (value === 2) || (value === 3))) { // value is valid
      message = Nmea2000.makeMessagePGN127502(parts[3], (parts[4] - 1), value);
      app.emit('nmea2000out', message);
      // app.emit('nmea2000out', message);
      log.N("transmitting NMEA message '%s'", message);
    } else {
      log.E("ignoring invalid put request");
    }
    return({ state: 'COMPLETED', statusCode: 200 });
  }

  
  return(plugin);
}
