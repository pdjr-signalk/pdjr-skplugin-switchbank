/**********************************************************************
 * Copyright 2018-2023 Paul Reeve <preeve@pdjr.eu>
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

const _ = require('lodash');
const Delta = require('signalk-libdelta/Delta.js');
const Log = require('signalk-liblog/Log.js');
const Nmea2000 = require('signalk-libnmea2000/Nmea2000.js');
const HttpInterface = require('signalk-libhttpinterface/HttpInterface.js');


const PLUGIN_ID = 'switchbank';
const PLUGIN_NAME = 'pdjr-skplugin-switchbank';
const PLUGIN_DESCRIPTION = 'N2K switchbank interface';
const PLUGIN_SCHEMA = {
  "type": "object",
  "properties": {
    "root": {
      "title": "Root path for all switchbank keys",
      "type": "string"
    },
    "metadataPublisher": {
      "title": "Metadata publication service configuration",
      "type": "object",
      "properties": {
        "endpoint": {
          "title": "Metadata publication endpoint",
          "type": "string"
        },
        "method": {
          "title": "Metadata publication method",
          "type": "string",
          "enum": [ "PATCH", "POST", "PUT" ]
        },
        "credentials": {
          "title": "Metadata publisher credentials",
          "type": "string"
        }
      },
      "default": { "method": "POST" }
    },
    "switchbanks" : {
      "title": "Switch bank definitions",
      "type": "array",
      "items": {
        "type": "object",
        "required": [ "instance", "channelcount" ],
        "properties": {
          "instance": {
            "description": "Switchbank instance number",
            "type": "number", "default": 0, "title": "Switch bank instance"
          },
          "type": {
            "description": "Switchbank type",
            "type": "string", "default": "relay", "enum": [ "switch", "relay" ], "title": "Switch bank type"
          },
          "channelCount": {
            "description": "Number of channels supported by this switchbank",
            "type": "number"
          },
          "pgn": {
            "description": "PGN used to update this switchbank",
            "type": "string"
          },
          "description": {
            "description": "Text describing the module (serial no, intall location, etc)",
            "type": "string", "default": "", "title": "Switch bank description"
          },
          "channels": {
            "title": "Switchbank channels",
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
              "required": [ "index", "channelCount" ],
              "default": { "description": "A switchbank channel" }
            }
          }
        },
        "required": [ "instance" ],
        "default": {
          "type": "relay",
          "channelCount": 8,
          "description": "A relay switchbank",
          "PGN": "127502",
          "channels": []
        },      
      }
    }
  },
  "required": [ "switchbanks" ],
  "default": {
    "root": "electrical.switches.bank.",
    "metadataPublisher": { "method": "POST" },
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
    plugin.options = _.cloneDeep(plugin.schema.default);
    _.merge(plugin.options, options);
    plugin.options.switchbanks = plugin.options.switchbanks.reduce((a,switchbank) => {
      try {
        var validSwitchbank = _.cloneDeep(plugin.schema.properties.switchbanks.items.default);
        _.merge(validSwitchbank, switchbank);
        if (!validSwitchbank.instance) throw new Error("missing switchbank 'instance' property");
        validSwitchbank.channels = validSwitchbank.channels.reduce((a,channel) => {
          try {
            var validChannel = { ...plugin.schema.properties.switchbanks.items.properties.channels.items.default, ...channel };
            if (validChannel.index === undefined) throw new Error("missing channel 'index' property");
            a.push(validChannel);
          } catch(e) { log.W(`dropping channel  (${e.message})`); }
          return(a);
        }, []);
        a.push(validSwitchbank);
      } catch(e) { log.W(`dropping switchbank (${e.message})`); }
      return(a);
    }, [])

    plugin.options.switchbanks.forEach(switchbank => {
      switchbank.channels.forEach(channel => {
        channel.path = `${plugin.options.root}${switchbank.instance}.${channel.index}.state`;
      });
    });

    app.debug(`using configuration: ${JSON.stringify(plugin.options, null, 2)}`);
        
    log.N(
      "operating %d switch and %d relay switch banks",
      plugin.options.switchbanks.reduce((a,sb) => (((sb.type) && (sb.type == 'switch'))?(a + 1):a), 0),
      plugin.options.switchbanks.reduce((a,sb) => (((!(sb.type)) || (sb.type == 'relay'))?(a + 1):a), 0)
    );

    // Create and install metadata
    publishMetadata(createMetadata(), plugin.options.metadataPublisher, (e) => {
      if (e) {
        log.W(`publish failed (${e.message})`, false);
        (new Delta(app, plugin.id)).addMetas(metadata).commit().clear();
      } else {
        log.N(`metadata published to '${plugin.options.metadataPublisher.endpoint}'`, false);
      }
    });

    // Register a put handler for all switch bank relay channels.
    plugin.options.switchbanks.filter(sb => (sb.type == 'relay')).forEach(switchbank => {
      switchbank.channels.forEach(channel => {
        app.debug(`installing put handler for '${channel.path}'`);
        app.registerPutHandler('vessels.self', channel.path, putHandler, plugin.id);
      });
    });
  }

  plugin.stop = function() {
	  unsubscribes.forEach(f => f());
	  unsubscribes = [];
  }

  // Create a metadata digest object and return it through callback().
  function createMetadata() {
    return(plugin.options.switchbanks.reduce((a,switchbank) => {
      a[`${plugin.options.root}${switchbank.instance}`] = {
        instance: switchbank.instance,
        type: switchbank.type,
        description: switchbank.description,
        channelCount: switchbank.channelCount,
        $source: `plugin:${plugin.id}`,
      }
      switchbank.channels.forEach(channel => {
        a[`${plugin.options.root}${switchbank.instance}.${channel.index}.state`] = {
          description: `Binary ${switchbank.type} state (0 = OFF, 1 = ON)`,
          type: switchbank.type,
          shortName: `[${switchbank.instance},${channel.index}]`,
          displayName: channel.description,
          longName: `${channel.description} [${switchbank.instance},${channel.index}]`,
          timeout: 10000,
          $source: `plugin:${plugin.id}` 
        }
      });
      return(a);
    },{}));
  }

  function publishMetadata(metadata, publisher, callback, options={ retries: 3, interval: 10000 }) {
    if ((publisher) && (publisher.endpoint) && (publisher.method) && (publisher.credentials)) {
      const httpInterface = new HttpInterface(app.getSelfPath('uuid'));
      httpInterface.getServerAddress().then((serverAddress) => {
        httpInterface.getServerInfo().then((serverInfo) => {
          const [ username, password ] = publisher.credentials.split(':');   
          httpInterface.getAuthenticationToken(username, password).then((token) => {
            const intervalId = setInterval(() => {
              if (options.retries-- === 0) {
                clearInterval(intervalId);
                callback(new Error(`tried ${options.interval} times with no success`));
              }
              fetch(`${serverAddress}${publisher.endpoint}`, { "method": publisher.method, "headers": { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, "body": JSON.stringify(metadata) }).then((response) => {
                if (response.status == 200) {
                  clearInterval(intervalId);
                  callback();
                }
              }).catch((e) => {
                clearInterval(intervalId);
                callback(new Error(e));
              });
            }, options.interval);
          })
        })
      })
    } else {
      callback(new Error(`'metadataPublisher' configuration is invalid`));
    }
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