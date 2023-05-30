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
const Nmea2000 = require("./lib/signalk-libnmea2000/Nmea2000.js");

const PLUGIN_ID = "switchbank";
const PLUGIN_NAME = "pdjr-skplugin-switchbank";
const PLUGIN_DESCRIPTION = "N2K switchbank interface";
const PLUGIN_SCHEMA = {
  "type": "object",
  "properties": {
    "root": {
      "title": "Root path under which switchbank keys will be inserted",
      "type": "string"
    },
    "switchbanks" : {
      "title": "Switch bank definitions",
      "type": "array",
      "default": [],
      "items": {
        "type": "object",
        "required": [ "instance", "channelcount" ],
        "properties": {
          "instance": {
            "description": "NMEA 2000 switchbank instance number",
            "type": "number", "default": 0, "title": "Switch bank instance"
          },
          "type": {
            "description": "Whether this switchbanks is a switch input module or a relay output module",
            "type": "string", "default": "relay", "enum": [ "switch", "relay" ], "title": "Switch bank type"
          },
          "channelcount": {
            "description": "Number of channels supported by the module",
            "type": "number", "default": 8, "title": "Number of supported channels"
          },
          "description": {
            "description": "Narrative describing the module (serial no, intall location, etc)",
            "type": "string", "default": "", "title": "Switch bank description"
          },
          "channels": {
            "title": "Switch bank channels",
            "type": "array",
            "items": {
              "type": "object",
              "required": [ "index" ],
              "properties": {
                "index": {
                  "title": "Channel index",
                  "type": "number",
                  "default": 1
                },
                "description": {
                  "title": "Channel description",
                  "type": "string",
                  "default": ""
                }
              }
            },
            "default": []
          }
        }
      }
    }
  },
  "required": [ "root", "switchbanks" ],
  "default": {
    "root": "electrical.switches.bank.",
    "switchbanks": []
  }
};
const PLUGIN_UISCHEMA = {};

module.exports = function(app) {
  var plugin = {};
  var unsubscribes = [];

  plugin.id = PLUGIN_ID;
  plugin.name = PLUGIN_NAME;
  plugin.description = PLUGIN_DESCRIPTION;
  plugin.schema = PLUGIN_SCHEMA;
  plugin.uiSchema = PLUGIN_UISCHEMA;

  const log = new Log(plugin.id, { ncallback: app.setPluginStatus, ecallback: app.setPluginError });
  const delta = new Delta(app, plugin.id);

  plugin.start = function(options) {

    if (Object.keys(options).length === 0) {
      options = plugin.schema.default;
      log.N("using default configuration", false);
    }

    if ((options.root) && (options.switchbanks) && (Array.isArray(options.switchbanks)) && (options.switchbanks.length !== 0)) {
      
      var channelCount = options.switchbanks.reduce((a,sb) => { return(a + ((sb.channels)?sb.channels.length:0)); }, 0);
      log.N("started: processing %d channel%s in %d switch bank%s", channelCount, ((channelCount == 1)?"":"s"), options.switchbanks.length, (options.switchbanks.length == 1)?"":"s");

      // Publish meta information for all maintained keys.
      options.switchbanks.forEach(switchbank => {
        switchbank.channels.forEach(channel => {
          var path = options.root + switchbank.instance + "." + channel.index + ".state";
          var value = {
            "description": "Binary " + switchbank.type + " state (0 = OFF, 1 = ON)",
            "type": switchbank.type,
            "shortName": "[" + switchbank.instance + "," + channel.index + "]",
            "displayName": channel.description || ("[" + switchbank.instance + "," + channel.index + "]"),
            "longName": channel.description || ("[" + switchbank.instance + "," + channel.index + "]") + " " + "[" + switchbank.instance + "," + channel.index + "]",
            "timeout": 10000
          };
          app.debug("saving metadata for '%s'", path);
          delta.addMeta(path, value);
        });
      });
      delta.commit().clear();

      // Register a put handler for all switch bank relay channels.
      options.switchbanks.filter(sb => (sb.type == "relay")).forEach(switchbank => {
        switchbank.channels.forEach(channel => {
          var path = options.root + switchbank.instance + "." + channel.index + ".state";
          app.debug("installing put handler for '%s'", path);
          app.registerPutHandler('vessels.self', path, actionHandler, plugin.id);
        });
      });
    } else {
      log.N("stopped: no switchbanks are configured");
    }
  }

  plugin.stop = function() {
	  unsubscribes.forEach(f => f());
	  unsubscribes = [];
  }

  /**
   * Process a put request for switchbank state change. Signal K does
   * not pass a handle to the request source and since we want to
   * process requests emanating from physical switches differently to
   * requests emanating from virtual devices, we need a work-around.
   *
   * So, we extend what constitutes a value (normally 0 or 1) to allow
   * values 2 and 3 for virtual OFF and ON.
   * 
   * @param {*} context 
   * @param {*} path 
   * @param {*} value 
   * @param {*} callback 
   * @returns 
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
      log.N("transmitted NMEA message '%s'", message);
    } else {
      log.E("ignoring invalid put request");
    }
    return({ state: 'COMPLETED', statusCode: 200 });
  }

  return(plugin);
}