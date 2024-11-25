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
import { Nmea2000 } from 'signalk-libnmea2000'

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
    "switchbanks" : {
      "title": "Switch bank definitions",
      "type": "array",
      "items": {
        "type": "object",
        "required": [ "instance", "channelcount" ],
        "properties": {
          "instance": {
            "description": "Switchbank instance number",
            "title": "Switchbank instance number",
            "type": "number",
          },
          "type": {
            "description": "Switchbank type",
            "title": "Switchbank type",
            "type": "string",
            "default": "relay",
            "enum": [ "relay", "switch" ], 
          },
          "pgn": {
            "description": "PGN used to update this switchbank",
            "title": "PGN used to control this switchbank",
            "type": "number",
            "default": 127502
          },
          "description": {
            "description": "Text describing the module (serial no, intall location, etc)",
            "title": "Switchbank description",
            "type": "string",
            "default": ""
          },
          "channels": {
            "description": "Array of switchbank channels",
            "title": "Switchbank channels",
            "type": "array",
            "default": [],
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
            }
          }
        }
      }
    }
  },
  "required": [ "switchbanks" ]
}
const PLUGIN_UISCHEMA: any = {}

const DEFAULT_ROOT: string = "electrical.switches.bank."
const DEFAULT_SWITCHBANK_TYPE: string = 'relay'
const DEFAULT_SWITCHBANK_PGN: number = 127501

module.exports = function(app: any) {
  let unsubscribes: (() => void)[] = [];
  let pluginConfiguration: PluginConfiguration | undefined = undefined;

  const plugin: SKPlugin = {

    id: PLUGIN_ID,
    name: PLUGIN_NAME,
    description: PLUGIN_DESCRIPTION,
    schema: PLUGIN_SCHEMA,
    uiSchema: PLUGIN_UISCHEMA,
    
    start: function(options: any) {
      try {
        // Try to elaborate a valid configuration from plugin options
        pluginConfiguration = createPluginConfiguration(options);
        app.debug(`using configuration: ${JSON.stringify(pluginConfiguration, null, 2)}`);

        app.setPluginStatus(`operating ${pluginConfiguration.switchbanks.reduce((a: any, sb: any) => (((sb.type) && (sb.type == 'switch'))?(a + 1):a), 0)} switch and ${options.switchbanks.reduce((a: any, sb: any) => (((!(sb.type)) || (sb.type == 'relay'))?(a + 1):a), 0)} relay switch banks`)

        // Create and install metadata
        publishMetadata(createMetadata(pluginConfiguration));
  
        // Register a put handler for all switch bank relay channels.
        pluginConfiguration.switchbanks.filter((switchbank) => (switchbank.type == 'relay')).forEach((switchbank) => {
          switchbank.channels.forEach((channel) => {
            app.debug(`installing put handler for '${channel.path}'`);
            app.registerPutHandler('vessels.self', channel.path, putHandler, plugin.id);
          });
        });
      } catch(e: any) {
        app.setPluginStatus('Stopped: bad or missing configuration');
        app.setPluginError(e.message);
      }
    },

    stop: function() {
	    unsubscribes.forEach((f)=> f());
	    unsubscribes = [];
    }

  }

  function createPluginConfiguration(options: any): PluginConfiguration {
    let pluginConfiguration: PluginConfiguration = {
      root: (options.root || DEFAULT_ROOT),
      switchbanks: []
    }
    if (!options.switchbanks) throw new Error('missing \'switchbanks\' property');
    if (!options.switchbanks.length) throw new Error('\'switchbanks\' property is empty');
    options.switchbanks.forEach((switchbankOption: any) => {
      if (!switchbankOption.instance) throw new Error('switchbank item has missing \'instance\' property');
      let switchbank: Switchbank = {
        instance: switchbankOption.instance,
        type: (switchbankOption.type)?switchbankOption.type:DEFAULT_SWITCHBANK_TYPE,
        pgn: (switchbankOption.pgn)?switchbankOption.pgn:DEFAULT_SWITCHBANK_PGN,
        description: (switchbankOption.description)?switchbankOption.description:`Switchbank ${switchbankOption.instance}`,
        channels:[]
      }
      if (!switchbankOption.channels) throw new Error('switchbank item has missing \'channels\' property') 
      if (!switchbankOption.channels.length) throw new Error('\'channels\' property\' is empty')
      switchbankOption.channels.forEach((channelOption: any) => {
        if (!channelOption.index) throw new Error('channel item has missing \'index\' property');
        let channel: Channel = {
          index: channelOption.index,
          description: (channelOption.description)?channelOption.description:`Channel ${channelOption.index}`,
          path: `${pluginConfiguration.root}${switchbank.instance}.${channelOption.index}.state`
        }
        switchbank.channels.push(channel);
      })
      pluginConfiguration.switchbanks.push(switchbank)
    })
    return(pluginConfiguration);
  }

  // Create and return a metadata digest object.
  function createMetadata(configuration: PluginConfiguration): MetadataDigest {
    return(
      configuration.switchbanks.reduce((a: MetadataDigest, switchbank) => {
        a[`${configuration.root}${switchbank.instance}`] = {
          instance: switchbank.instance,
          type: switchbank.type,
          description: switchbank.description,
          channelCount: switchbank.channels.length,
          $source: `plugin:${plugin.id}`,
        }
        switchbank.channels.forEach((channel: any) => {
          a[channel.path] = {
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
      },{})
    );
  }
    
  // Publish metadata object.
  function publishMetadata(metadata: MetadataDigest) {
    var delta = new Delta(app, plugin.id);
    Object.keys(metadata).forEach((path) => delta.addMeta(path, metadata[path]));
    delta.commit().clear();
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
  
  return(plugin);
  
}

interface SKPlugin {
  id: string,
  name: string,
  description: string,
  schema: any,
  uiSchema: any,

  start: (options: any) => void,
  stop: () => void
}

interface PluginConfiguration {
  root: string,
  switchbanks: Switchbank[]
}

interface Switchbank {
  instance: number,
  type: string,
  pgn: number,
  description: string,
  channels: Channel[]
}

interface Channel {
  index: number,
  description: string
  path?: string
}


interface MetadataItem {
  [index: string]: any
}

interface MetadataDigest {
  [index: string]: MetadataItem
}
