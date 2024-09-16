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

import * as _ from 'lodash'
import { Delta } from 'signalk-libdelta'
import Nmea2000 from 'signalk-libnmea2000/Nmea2000.js'
import { HttpInterface } from 'signalk-libhttpinterface'


const PLUGIN_ID: string = 'switchbank'
const PLUGIN_NAME: string = 'pdjr-skplugin-switchbank'
const PLUGIN_DESCRIPTION: string = 'N2K switchbank interface'
const PLUGIN_SCHEMA: any = {
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
}
const PLUGIN_UISCHEMA: any = {}

module.exports = function(app: any) {
  let unsubscribes: (() => void)[] = []

  const plugin: SKPlugin = {

    id: PLUGIN_ID,
    name: PLUGIN_NAME,
    description: PLUGIN_DESCRIPTION,
    schema: PLUGIN_SCHEMA,
    uiSchema: PLUGIN_UISCHEMA,
    options: {},
    
    start: function(options: any) {
      plugin.options = _.cloneDeep(plugin.schema.default);
      _.merge(plugin.options, options);
      plugin.options.switchbanks = plugin.options.switchbanks.reduce((a: any, switchbank: any) => {
        try {
          var validSwitchbank = _.cloneDeep(plugin.schema.properties.switchbanks.items.default);
          _.merge(validSwitchbank, switchbank);
          if (!validSwitchbank.instance) throw new Error("missing switchbank 'instance' property");
          validSwitchbank.channels = validSwitchbank.channels.reduce((a: any,channel: any) => {
            try {
              var validChannel = { ...plugin.schema.properties.switchbanks.items.properties.channels.items.default, ...channel };
              if (validChannel.index === undefined) throw new Error("missing channel 'index' property");
              a.push(validChannel);
            } catch(e) { if (e instanceof Error) app.setPluginError(`dropping channel  (${e.message})`); }
            return(a);
          }, []);
          a.push(validSwitchbank);
        } catch(e) { if (e instanceof Error) app.setPluginError(`dropping switchbank (${e.message})`); }
        return(a);
      }, [])

      plugin.options.switchbanks.forEach((switchbank: any) => {
        switchbank.channels.forEach((channel: any) => {
          channel.path = `${plugin.options.root}${switchbank.instance}.${channel.index}.state`
        })
      })

      app.debug(`using configuration: ${JSON.stringify(plugin.options, null, 2)}`)
        
      app.setPluginStatus(
        "operating %d switch and %d relay switch banks",
        plugin.options.switchbanks.reduce((a: any, sb: any) => (((sb.type) && (sb.type == 'switch'))?(a + 1):a), 0),
        plugin.options.switchbanks.reduce((a: any, sb: any) => (((!(sb.type)) || (sb.type == 'relay'))?(a + 1):a), 0)
      )

      // Create and install metadata
      publishMetadata(createMetadata(), plugin.options.metadataPublisher, (e: any) => {
        if ((e) && ( e instanceof Error)) {
          app.setPluginStatus(`publish failed (${e.message})`, false);
          (new Delta(app, plugin.id)).addMetas(createMetadata()).commit().clear();
        } else {
          app.setPluginStatus(`metadata published to '${plugin.options.metadataPublisher.endpoint}'`, false);
        }
      });

      // Register a put handler for all switch bank relay channels.
      plugin.options.switchbanks.filter((sb: any) => (sb.type == 'relay')).forEach((switchbank: any) => {
        switchbank.channels.forEach((channel: any) => {
          app.debug(`installing put handler for '${channel.path}'`);
          app.registerPutHandler('vessels.self', channel.path, putHandler, plugin.id);
        });
      });

      // Create and return a metadata digest object.
      function createMetadata(): any {
        return(plugin.options.switchbanks.reduce((a: any, switchbank: any) => {
          a[`${plugin.options.root}${switchbank.instance}`] = {
            instance: switchbank.instance,
            type: switchbank.type,
            description: switchbank.description,
            channelCount: switchbank.channelCount,
            $source: `plugin:${plugin.id}`,
          }
          switchbank.channels.forEach((channel: any) => {
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

      // Publish metadata object to publisher.
      function publishMetadata(metadata: any, publisher: any, callback: any, options={ retries: 3, interval: 10000 }) {
        if ((publisher) && (publisher.endpoint) && (publisher.method) && (publisher.credentials)) {
          const httpInterface = new HttpInterface(app.getSelfPath('uuid'));
          httpInterface.getServerAddress().then((serverAddress: string) => {
            httpInterface.getServerInfo().then((serverInfo: any) => {
              const [ username, password ] = publisher.credentials.split(':');   
              httpInterface.getAuthenticationToken(username, password).then((token: string) => {
                const intervalId = setInterval(() => {
                  if (options.retries-- === 0) {
                    clearInterval(intervalId);
                    callback(new Error(`tried ${options.retries} times with no success`));
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
      function putHandler(context: any, path: string, value: any, callback: any) {
        app.debug(`processing put request (path = ${path}, value = ${value})`);
        var parts: string[] = path.split('.') || [];
        if (!isNaN(parseFloat(parts[3]))) {
          var instance: number = parseInt(parts[3]);
          if ((instance >= 0) && (instance <= 0xFE)) {
            if (!isNaN(parseFloat(parts[4]))) {
              var channel = parseInt(parts[4]);
              if  ((channel >= 1) && (channel <= 28)) {
                if ((!isNaN(value)) && (!isNaN(parseFloat(value)))) {
                  value = parseInt(value);
                  if ((value == 0) || (value == 1) || (value == 2) || (value == 3)) {
                    var message = Nmea2000.makeMessagePGN127502(instance, (channel - 1), value);
                    app.emit('nmea2000out', message);
                    app.setPluginStatus(`transmitted NMEA message '${message}'`);
                  } else {
                    app.setPluginError(`put request contains invalid value (${value})`);
                  }
                } else {
                  app.setPluginError(`put request value is not a number (${value})`);
                }
              } else {
                app.setPluginError(`put request channel is out of range (${channel})`);
              }
            } else {
              app.setPluginError(`put request channel is not a number (${parts[4]})`);
            }
          } else {
            app.setPluginError(`put request instance is out of range (${instance})`);
          }
        } else {
          app.setPluginError(`put request instance is not a number (${parts[3]})`);
        }
        return({ state: 'COMPLETED', statusCode: 200 });
      }
    },

    stop: function() {
	    unsubscribes.forEach((f)=> f());
	    unsubscribes = [];
    }

  }
  
  return(plugin)
  
}

interface SKPlugin {
  id: string,
  name: string,
  description: string,
  schema: any,
  uiSchema: any,

  start: (options: any) => void,
  stop: () => void,
  
  options: any
}