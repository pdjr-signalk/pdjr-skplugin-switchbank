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
            "description": "Switchbank instance number",
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
            "description": "Text describing the module (serial no, intall location, etc)",
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
      log.W("using default configuration");
    }

    if ((options.root) && (options.switchbanks) && (Array.isArray(options.switchbanks)) && (options.switchbanks.length !== 0)) {
      
      var channelCount = options.switchbanks.reduce((a,sb) => { return(a + ((sb.channels)?sb.channels.length:0)); }, 0);
      log.N("started: processing %d channel%s in %d switch bank%s", channelCount, ((channelCount == 1)?"":"s"), options.switchbanks.length, (options.switchbanks.length == 1)?"":"s");

      // Publish meta information for all maintained keys.
      options.switchbanks.forEach(switchbank => {
        var path = options.root + switchbank.instance;
        var value = {
          "description" : switchbank.description,
          "type": switchbank.type,
          "instance": switchbank.instance,
          "channelCount": switchbank.channelcount
        };
        app.debug("saving metadata for '%s' (%s)", path, JSON.stringify(value));
        delta.addMeta(path, value);
        switchbank.channels.forEach(channel => {
          path = options.root + switchbank.instance + "." + channel.index + ".state";
          value = {
            "description": "Binary " + switchbank.type + " state (0 = OFF, 1 = ON)",
            "type": switchbank.type,
            "shortName": "[" + switchbank.instance + "," + channel.index + "]",
            "displayName": channel.description || ("[" + switchbank.instance + "," + channel.index + "]"),
            "longName": channel.description + ("[" + switchbank.instance + "," + channel.index + "]"),
            "timeout": 10000
          };
          app.debug("saving metadata for '%s' (%s)", path, JSON.stringify(value));
          delta.addMeta(path, value);
        });
      });
      delta.commit().clear();

      // Register a put handler for all switch bank relay channels.
      options.switchbanks.filter(sb => (sb.type == "relay")).forEach(switchbank => {
        switchbank.channels.forEach(channel => {
          var path = options.root + switchbank.instance + "." + channel.index + ".state";
          app.debug("installing put handler for '%s'", path);
          app.registerPutHandler('vessels.self', path, putHandler, plugin.id);
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
  function putHandler(context, path, value, callback) {
    app.debug("processing put request (path = %s, value = %s)", path, value);
    var parts = path.split('.') || [];
    if ((!isNaN(parts[3])) && (!isNaN(parseFloat(parts[3])))) {
      var instance = parseInt(parts[3]);
      if ((instance >= 0) && (instance <= 0xFE)) {
        if ((!isNaN(parts[4])) && (!isNaN(parseFloat(parts[4])))) {
          var channel = parseInt(parts[4]);
          if  ((channel >= 1) && (channel <= 28)) {
            if ((!isNaN(value)) && (!isNaN(parseFloat(value)))) {
              value = parseInt(value);
              if ((value == 0) || (value == 1) || (value == 2) || (value == 3)) {
                var message = Nmea2000.makeMessagePGN127502(instance, (channel - 1), value);
                app.emit('nmea2000out', message);
                log.N("transmitted NMEA message '%s'", message);
              } else {
                log.E("put request contains invalid value (%d)", value);
              }
            } else {
              log.E("put request value is not a number (%s)", value);
            }
          } else {
            log.E("put request channel is out of range (%d)", channel);
          }
        } else {
          log.E("put request channel is not a number (%s)", parts[4]);
        }
      } else {
        log.E("put request instance is out of range (%d)", instance);
      }
    } else {
      log.E("put request instance is not a number (%s)", parts[3]);
    }
    return({ state: 'COMPLETED', statusCode: 200 });
  }

  return(plugin);
}