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

const Delta = require('./lib/signalk-libdelta/Delta.js');
const Log = require('./lib/signalk-liblog/Log.js');
const Nmea2000 = require('./lib/signalk-libnmea2000/Nmea2000.js');

const PLUGIN_ID = "switchbank";
const PLUGIN_NAME = "pdjr-skplugin-switchbank";
const PLUGIN_DESCRIPTION = "N2K switchbank interface";
const PLUGIN_SCHEMA = {
  "type": "object",
  "properties": {
    "root": {
      "title": "Root path for all switchbank keys",
      "type": "string",
      "default": "electrical.switches.bank."
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
          "description": {
            "description": "Text describing the module (serial no, intall location, etc)",
            "type": "string", "default": "", "title": "Switch bank description"
          },
          "channels": {
            "title": "Switch bank channels",
            "type": "array",
            "items": {
              "type": "object",
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
              },
              "required": [ "index" ]
            },
            "default": []
          }
        },
        "required": [ "instance", "channels" ],
        "default": []
      }
    }
  },
  "required": [ "root", "switchbanks" ]
};
const PLUGIN_UISCHEMA = {};

const SWITCHBANK_TYPE_DEFAULT = "relay";
const SWITCHBANK_DESCRIPTION_DEFAULT = "";
const CHANNEL_DESCRIPTION_DEFAULT = "";

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
    plugin.options = {};
    plugin.options.root = (options.root)?options.root:plugin.schema.properties.root.default;
    plugin.options.switchbanks = (options.switchbanks)?options.switchbanks:plugin.schema.properties.switchbanks.default;
    app.debug(`Using configuration: ${JSON.stringify(plugin.options, null, 2)}`);

    if ((plugin.options.root) && (plugin.options.switchbanks) && (Array.isArray(plugin.options.switchbanks)) && (plugin.options.switchbanks.length > 0)) {
        
      log.N(
        "operating %d switch and %d relay switch banks",
        plugin.options.switchbanks.reduce((a,sb) => (((sb.type) && (sb.type == 'switch'))?(a + 1):a), 0),
        plugin.options.switchbanks.reduce((a,sb) => (((!(sb.type)) || (sb.type == 'relay'))?(a + 1):a), 0)
      );

      // Publish meta information for all maintained keys.
      try {
        plugin.options.switchbanks.forEach(switchbank => {
          if (switchbank.instance) {
            switchbank.path = options.root + switchbank.instance;
            switchbank.type = (switchbank.type)?switchbank.type:SWITCHBANK_TYPE_DEFAULT;
            switchbank.description = (switchbank.description)?switchbank.description:SWITCHBANK_DESCRIPTION_DEFAULT;

            var value = { instance: switchbank.instance, type: switchbank.type, description: switchbank.description };
            app.debug(`saving metadata for '${switchbank.path}' (${JSON.stringify(value)})`);
            delta.addMeta(switchbank.path, value);
          } else {
            throw new Error('missing switchbank instance property');
          }

          switchbank.channels.forEach(channel => {
            if (channel.index) {
              channel.path = `${switchbank.path}.${channel.index}.state`;
              channel.description = (channel.description)?channel.description:CHANNEL_DESCRIPTION_DEFAULT;
              value = {
                description: `Binary ${switchbank.type} state (0 = OFF, 1 = ON)`,
                type: switchbank.type,
                shortName: `[${switchbank.instance},${channel.index}]`,
                displayName: channel.description,
                longName: `${channel.description} [${switchbank.instance},${channel.index}]`,
                timeout: 10000
              };
              app.debug(`saving metadata for '${channel.path}' (${JSON.stringify(value)})`);
              delta.addMeta(channel.path, value);
            } else {
              throw new Error('missing channel index property');
            }
          });
        });
        delta.commit().clear();

        // Register a put handler for all switch bank relay channels.
        plugin.options.switchbanks.filter(sb => (sb.type == 'relay')).forEach(switchbank => {
          switchbank.channels.forEach(channel => {
            app.debug(`installing put handler for '${channel.path}'`);
            app.registerPutHandler('vessels.self', channel.path, putHandler, plugin.id);
          });
        });
      } catch(e) {
        log.E(`plugin configuration error (${e.message})`);
      }
    } else {
      log.E('plugin configuration missing root and/or switchbanks properties');
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
    app.debug(`processing put request (path = ${path}, value = ${value})`);
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
                log.N(`transmitted NMEA message '${message}'`);
              } else {
                log.E(`put request contains invalid value (${value})`);
              }
            } else {
              log.E(`put request value is not a number (${value})`);
            }
          } else {
            log.E(`put request channel is out of range (${channel})`);
          }
        } else {
          log.E(`put request channel is not a number (${parts[4]})`);
        }
      } else {
        log.E(`put request instance is out of range (${instance})`);
      }
    } else {
      log.E(`put request instance is not a number (${parts[3]})`);
    }
    return({ state: 'COMPLETED', statusCode: 200 });
  }

  return(plugin);
}