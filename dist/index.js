"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
const signalk_libdelta_1 = require("signalk-libdelta");
const signalk_libnmea2000_1 = require("signalk-libnmea2000");
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
        "switchbanks": {
            "title": "Switch bank definitions",
            "type": "array",
            "items": {
                "type": "object",
                "required": ["instance", "channelcount"],
                "properties": {
                    "instance": {
                        "description": "Switchbank instance number",
                        "type": "number", "default": 0, "title": "Switch bank instance"
                    },
                    "type": {
                        "description": "Switchbank type",
                        "type": "string", "default": "relay", "enum": ["relay", "switch"], "title": "Switch bank type"
                    },
                    "pgn": {
                        "description": "PGN used to update this switchbank",
                        "type": "string"
                    },
                    "description": {
                        "description": "Text describing the module (serial no, intall location, etc)",
                        "type": "string", "default": "", "title": "Switch bank description"
                    },
                    "numberOfChannels": {
                        "description": "Number of channels supported by this switchbank",
                        "type": "number"
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
                            "required": ["index", "channelCount"],
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
    "required": ["switchbanks"],
    "default": {
        "root": "electrical.switches.bank.",
        "switchbanks": []
    }
};
const PLUGIN_UISCHEMA = {};
const DEFAULT_ROOT = "electrical.switches.bank.";
const DEFAULT_SWITCHBANK_TYPE = 'relay';
const DEFAULT_SWITCHBANK_PGN = 127501;
module.exports = function (app) {
    let unsubscribes = [];
    let pluginConfiguration = undefined;
    const plugin = {
        id: PLUGIN_ID,
        name: PLUGIN_NAME,
        description: PLUGIN_DESCRIPTION,
        schema: PLUGIN_SCHEMA,
        uiSchema: PLUGIN_UISCHEMA,
        start: function (options) {
            try {
                // Try to elaborate a valid configuration from plugin options
                pluginConfiguration = createPluginConfiguration(options);
                app.debug(`using configuration: ${JSON.stringify(pluginConfiguration, null, 2)}`);
                app.setPluginStatus(`operating ${pluginConfiguration.switchbanks.reduce((a, sb) => (((sb.type) && (sb.type == 'switch')) ? (a + 1) : a), 0)} switch and ${options.switchbanks.reduce((a, sb) => (((!(sb.type)) || (sb.type == 'relay')) ? (a + 1) : a), 0)} relay switch banks`);
                // Create and install metadata
                publishMetadata(createMetadata(pluginConfiguration));
                // Register a put handler for all switch bank relay channels.
                pluginConfiguration.switchbanks.filter((switchbank) => (switchbank.type == 'relay')).forEach((switchbank) => {
                    switchbank.channels.forEach((channel) => {
                        app.debug(`installing put handler for '${channel.path}'`);
                        app.registerPutHandler('vessels.self', channel.path, putHandler, plugin.id);
                    });
                });
            }
            catch (e) {
                app.setPluginStatus('Stopped: bad or missing configuration');
                app.setPluginError(e.message);
            }
        },
        stop: function () {
            unsubscribes.forEach((f) => f());
            unsubscribes = [];
        }
    };
    function createPluginConfiguration(options) {
        let pluginConfiguration = {
            root: (options.root || DEFAULT_ROOT),
            switchbanks: []
        };
        if (!options.switchbanks)
            throw new Error('missing \'switchbanks\' property');
        if (!options.switchbanks.length)
            throw new Error('\'switchbanks\' property is empty');
        options.switchbanks.forEach((switchbankOption) => {
            if (!switchbankOption.instance)
                throw new Error('switchbank item has missing \'instance\' property');
            let switchbank = {
                instance: switchbankOption.instance,
                type: (switchbankOption.type) ? switchbankOption.type : DEFAULT_SWITCHBANK_TYPE,
                pgn: (switchbankOption.pgn) ? switchbankOption.pgn : DEFAULT_SWITCHBANK_PGN,
                description: (switchbankOption.description) ? switchbankOption.description : `Switchbank ${switchbankOption.instance}`,
                channels: []
            };
            if (!switchbankOption.channels)
                throw new Error('switchbank item has missing \'channels\' property');
            if (!switchbankOption.channels.length)
                throw new Error('\'channels\' property\' is empty');
            switchbankOption.channels.forEach((channelOption) => {
                if (!channelOption.index)
                    throw new Error('channel item has missing \'index\' property');
                let channel = {
                    index: channelOption.index,
                    description: (channelOption.description) ? channelOption.description : `Channel ${channelOption.index}`,
                    path: `${pluginConfiguration.root}${switchbank.instance}.${channelOption.index}.state`
                };
                switchbank.channels.push(channel);
            });
            pluginConfiguration.switchbanks.push(switchbank);
        });
        return (pluginConfiguration);
    }
    // Create and return a metadata digest object.
    function createMetadata(configuration) {
        return (configuration.switchbanks.reduce((a, switchbank) => {
            a[`${configuration.root}${switchbank.instance}`] = {
                instance: switchbank.instance,
                type: switchbank.type,
                description: switchbank.description,
                channelCount: switchbank.channels.length,
                $source: `plugin:${plugin.id}`,
            };
            switchbank.channels.forEach((channel) => {
                a[channel.path] = {
                    description: `Binary ${switchbank.type} state (0 = OFF, 1 = ON)`,
                    type: switchbank.type,
                    shortName: `[${switchbank.instance},${channel.index}]`,
                    displayName: channel.description,
                    longName: `${channel.description} [${switchbank.instance},${channel.index}]`,
                    timeout: 10000,
                    $source: `plugin:${plugin.id}`
                };
            });
            return (a);
        }, {}));
    }
    // Publish metadata object.
    function publishMetadata(metadata) {
        var delta = new signalk_libdelta_1.Delta(app, plugin.id);
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
    function putHandler(context, path, value, callback) {
        app.debug(`processing put request (path = ${path}, value = ${value})`);
        var parts = path.split('.') || [];
        if (!isNaN(parseFloat(parts[3]))) {
            var instance = parseInt(parts[3]);
            if ((instance >= 0) && (instance <= 0xFE)) {
                if (!isNaN(parseFloat(parts[4]))) {
                    var channel = parseInt(parts[4]);
                    if ((channel >= 1) && (channel <= 28)) {
                        if ((!isNaN(value)) && (!isNaN(parseFloat(value)))) {
                            value = parseInt(value);
                            if ((value == 0) || (value == 1) || (value == 2) || (value == 3)) {
                                var message = signalk_libnmea2000_1.Nmea2000.makeMessagePGN127502(instance, (channel - 1), value);
                                app.emit('nmea2000out', message);
                                app.setPluginStatus(`transmitted NMEA message '${message}'`);
                            }
                            else {
                                app.setPluginError(`put request contains invalid value (${value})`);
                            }
                        }
                        else {
                            app.setPluginError(`put request value is not a number (${value})`);
                        }
                    }
                    else {
                        app.setPluginError(`put request channel is out of range (${channel})`);
                    }
                }
                else {
                    app.setPluginError(`put request channel is not a number (${parts[4]})`);
                }
            }
            else {
                app.setPluginError(`put request instance is out of range (${instance})`);
            }
        }
        else {
            app.setPluginError(`put request instance is not a number (${parts[3]})`);
        }
        return ({ state: 'COMPLETED', statusCode: 200 });
    }
    return (plugin);
};
