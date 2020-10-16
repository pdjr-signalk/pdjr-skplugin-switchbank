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

const fs = require('fs');
const bacon = require('baconjs');
const Log = require("./lib/signalk-liblog/Log.js");
const DebugLog = require("./lib/signalk-liblog/DebugLog.js");
const Schema = require("./lib/signalk-libschema/Schema.js");
const Nmea2000 = require("./lib/signalk-libnmea2000/Nmea2000.js");

const PLUGIN_SCHEMA_FILE = __dirname + "/schema.json";
const PLUGIN_UISCHEMA_FILE = __dirname + "/uischema.json";
const DEBUG_KEYS = [ "state", "commands" ];

module.exports = function(app) {
  var plugin = {};
  var unsubscribes = [];
  var switchbanks = {};

  plugin.id = "switchbank";
  plugin.name = "Switch bank interface";
  plugin.description = "NMEA 2000 switch bank interface.";

  const log = new Log(plugin.id, { ncallback: app.setProviderStatus, ecallback: app.setProviderError });
  const debug = new DebugLog(plugin.id, DEBUG_KEYS);

  plugin.schema = function() {
    var schema = Schema.createSchema(PLUGIN_SCHEMA_FILE);
    return(schema.getSchema());
  };

  plugin.uiSchema = function() {
    var schema = Schema.createSchema(PLUGIN_UISCHEMA_FILE);
    return(schema.getSchema());
  }

  plugin.start = function(options) {
    log.N("listening on control channel %s", options.controlchannel);
    debug.N("*", "available debug tokens: %s", debug.getKeys().join(", "));

    /******************************************************************
     * Harvest documentary data from the defined switchbanks and write
     * it to the Signal K tree as meta information for each of the
     * specified switch channel paths.
     */

    var flattenedChannels = options.switchbanks.reduce((a,sb) => a.concat(sb.channels.map(ch => { return({"instance": sb.instance, "index": (ch.index + 1), "type": sb.type, "description": ch.description })})), []);
    var deltas = flattenedChannels.map(c => ({
      "path": "electrical.switches.bank." + c.instance + "." + c.index + ".meta",
      "value": { "name": c.description, "type": c.type }
    }));
    app.handleMessage(plugin.id, makeDelta(plugin.id, deltas));

    /******************************************************************
     * NMEA switchbanks are updated with aggregate state information
     * for every contained channel. Consequently, we need to keep track
     * of relay switchbank channel states so that we can easily make an
     * update message when we need to.
     */

    options.switchbanks.filter(sb => (sb.type == "relay")).forEach(switchbank => {
      let instance = switchbank.instance; 
      var maxindex = switchbank.channels.reduce((a,c) => ((c.index > a)?c.index:a), 0);
      debug.N("state", "creating relay state model for switchbank %d (%d channels)", instance, (maxindex + 1)); 
      switchbanks[instance] = (new Array(maxindex + 1)).fill(undefined);
      for (var i = 0; i < switchbank.channels.length; i++) {
        let channel = switchbank.channels[i].index;
        let stream = app.streambundle.getSelfStream("electrical.switches.bank." + instance + "." + (channel + 1) + ".state");
        let description = switchbank.channels[i].description;
        if (stream) stream.skipDuplicates().onValue(v => {
          switchbanks[instance][channel] = v;
          debug.N("state", "updating relay state model [%d,%d] = %d (%s)", instance, channel, v, description);
        });
      }
    });

    /******************************************************************
     * And finally, we just wait for commands to appear on the command
     * channel and, if they specify one of our relay output modules,
     * then we issue an appropriate PGN 127502.
     */

    var controlchannel = options.controlchannel.split(':');
    switch (controlchannel[0]) {
      case "notification":
        var stream = app.streambundle.getSelfStream(controlchannel[1]).skipDuplicates();
        if (stream) {
          unsubscribes.push(stream.onValue(v => {
            var command = (v.description)?JSON.parse(v.description):{};
            var moduleid = (command.moduleid !== undefined)?command.moduleid:null;
            var channelid = (command.channelid !== undefined)?parseInt(command.channelid):null;
            var state = (command.state !== undefined)?parseInt(command.state):null;
            if ((moduleid !== null) && (channelid !== null) && (state !== null)) {
              if (switchbanks[moduleid] !== undefined) {
                debug.N("commands", "received command %s", JSON.stringify(command));
                var buffer = Array.from(switchbanks[moduleid]).map(v => (v === undefined)?0:v);
                buffer[channelid] = ((state)?1:0);
                message = Nmea2000.makeMessagePGN127502(moduleid, buffer);
                app.emit('nmea2000out', message);
                debug.N("commands", "transmitted NMEA message '%s'", message);
              }
            }
          }));
        } else {
          log.N("unable to attach to command channel (%s)", options.commandchannel);
        }
      default:
        break;
    }
  }

  plugin.stop = function() {
	unsubscribes.forEach(f => f());
	unsubscribes = [];
  }

  /********************************************************************
   * Return a delta from <pairs> which can be a single value of the
   * form { path, value } or an array of such values. <src> is the name
   * of the process which will issue the delta update.
   */

  function makeDelta(src, pairs = []) {
    pairs = (Array.isArray(pairs))?pairs:[pairs]; 
    return({
      "updates": [{
        "source": { "type": "plugin", "src": src, },
        "timestamp": (new Date()).toISOString(),
        "values": pairs.map(p => { return({ "path": p.path, "value": p.value }); }) 
      }]
    });
  }

  return(plugin);
}
