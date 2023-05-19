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
  }
};
const PLUGIN_UISCHEMA = {};

const OPTIONS_DEFAULT = {
  "root": "electrical.switches.bank.",
  "switchbanks": []
};

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
      options = OPTIONS_DEFAULT;
      app.savePluginOptions(options, () => log.N("using default options and saving them to disk", false));
    }

    if ((options.root) && (options.switchbanks.length !== 0)) {
      
      var channelCount = options.switchbanks.reduce((a,sb) => { return(a + ((sb.channels)?sb.channels.length:0)); }, 0);
      log.N("processing %d channel%s in %d switch bank%s", channelCount, ((channelCount == 1)?"":"s"), options.switchbanks.length, (options.switchbanks.length == 1)?"":"s");

      // Publish meta information for all maintained keys.
      delta.addValues(options.switchbanks.reduce((a,sb) => {
        if (sb.channels.length !== 0) {
          sb.channels.forEach(channel => {
            a.push({
              "path": options.root + sb.instance + "." + channel.index + ".state",
              "value": {
                "description": "Binary " + sb.type + " state (0 = OFF, 1 = ON)",
                "type": sb.type,
                "shortName": "[" + sb.instance + "," + channel.index + "]",
                "displayName": channel.description || ("[" + sb.instance + "," + channel.index + "]"),
                "longName": channel.description || ("[" + sb.instance + "," + channel.index + "]") + " " + "[" + sb.instance + "," + channel.index + "]",
                "timeout": 10000;
              }
            });
          });
        }
        return(a);
      }, []));
      delta.commit().clear();

      // Register a put handler for all switch bank relay channels.
      options.switchbanks.filter(sb => (sb.type == "relay")).forEach(sb => {
        for (var ch = 1; ch <= sb.channelcount; ch++) {
          var path = options.root + sb.instance + "." + ch + ".state";
          app.registerPutHandler('vessels.self', path, actionHandler, plugin.id);
        }
      });
    } else {
      log.W("no switchbanks are configured");
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
      log.N("transmitting NMEA message '%s'", message);
    } else {
      log.E("ignoring invalid put request");
    }
    return({ state: 'COMPLETED', statusCode: 200 });
  }

  return(plugin);
}