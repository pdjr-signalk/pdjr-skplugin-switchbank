# signalk-switchbank

NMEA 2000 switch bank interface.

This project implements a plugin for the
[Signal K Node server](https://github.com/SignalK/signalk-server-node).

Reading the [Alarm, alert and notification handling](http://signalk.org/specification/1.0.0/doc/notifications.html)
section of the Signal K documentation may provide helpful orientation.

__signalk-switchbank__ provides an interface for multi-channel switch
and relay modules which operate using the NMEA 2000 Switch Bank
protocol implemented by PGN 127501 (Switch Bank Status) and  PGN 127502
(Switch Bank Control).

PGN 127501 messages are processed natively by Signal K into paths under
"electrical.switches.bank....".
These paths are updated in real time to report the state of every
switch bank channel detected on the host NMEA bus.

__signalk-switchbank__ extends this native support in two ways.

Firstly, by providing a mechanism for decorating the switch bank paths
built by Signal K with meta data derived from the plugin configuration
file.

Secondly, by providing a means of operating switch bank relay modules
in response to commands received on a control channel.
The control channel can be a Signal K notification path, a Unix domain
socket (IPC) or a host system D-Bus channel.
The plugin operates remote switch bank relays by transmitting PGN 127502
messages on the host NMEA bus.

## Overview

The __signalk-switchbank__ configuration file, ```switchbank.json```,
contains a collection of switchbank definitions which describe the NMEA
2000 switch and relay banks that are under its purview.

### Adding meta information to switch bank paths

__signalk-switchbank__ begins execution by collating descriptive data
for each defined switchbank channel and writing this as a single delta
update of the Signal K switch channel paths under
"electrical.switches.bank...".

The usefulness of this meta information is documentary, allowing
consumers of switch bank data to present information in a more
accessible way.
For example, the
[signalk-switch-monitor](https://github.com/preeve9534/signalk-switch-monitor)
plugin uses this meta-data to build a switch bank status display.

### Operating NMEA 2000 switch bank relays 

__signalk-switchbank__ attaches to a *control channel* specified in its
configuration file and listens for string-encode JSON commands of the
form:
```
{
  "moduleid": "*moduleid*",    // relay module instance number
  "channelid": "*channelid*",  // relay channel index number
  "state": "*state*"           // "0" or "1" (for OFF/ON)
}
```

When the control channel is a notification path, then the JSON command
string is taken to be the value of the notification's description
property.

The plugin parses the command string, checks its validity, verifies
that the specified *moduleid* and *channelid* identify a configured
relay switchbank, and promptly issues a PGN 127502 NMEA message to
update the state of the specified remote module.

The plugin
[signalk-switchlogic](https://github.com/preeve9534/signalk-switchlogic)
can be used to generate commands of the form consumed by
__signalk-switchbank__ and the use of these plugins together enables
simple and complex switching rules to directly operate NMEA 2000
relays. 
 
## System requirements

__signalk-switchbank__ has no special installation requirements.

Relay switchbank modules which are to be operated by the plugin must
respond to NMEA 2000 PGN 127502 (Switch Bank Update).

## Installation

Download and install __signalk-switchbank__ using the "Appstore" menu
option in your Signal K Node server console.
The plugin can also be obtained from the 
[project homepage](https://github.com/preeve9534/signalk-switchbank)
and installed using
[these instructions](https://github.com/SignalK/signalk-server-node/blob/master/SERVERPLUGINS.md).

## Configuration

You can maintain the __signalk-switchbank__ configuration using either
the Signal K plugin configuration GUI, or by editing the configuration
file ```switchbank.json``` using a text editor.

The configuration file must have the following general structure:
```
{
  "enabled": true,
  "enableLogging": false,
  "configuration": {
    "controlchannel": "notification:notifications.switchlogic.control",
    "switchbanks": [
      *** ONE OR MORE SWITCHBANK DEFINITIONS ***
    ]
  }
}
```

The __controlchannel__ property value introduces a configuration string
which sets up the channel on which the plugin will listen for relay
operating commands.
The configurations string must consist of two, colon-delimited, fields
"*channel-type*__:__*channel-id*" with the following value constraints.

| *channel-type*   | *channel-id*                                               |
|:-----------------|:-----------------------------------------------------------|
| __notification__ | A path in the Signal K "notifications...." tree.           |
| __ipc__          | The pathname of a Unix domain socket.                      |
| __dbus__         | The name of D-Bus channel in the host operating system.    |

The property value defaults to "notification:notifications.switchlogic.command".

The __switchbanks__ array is used to define the NMEA 2000 switchbanks
which are of interest to the plugin.

Each entry in the __switchbanks__ array defines a single switchbank.
Here's an example drawn from my configuration file:
```
      {
        "instance": 10,
        "type": "relay",
        "description": "Engine room relay module #210-3452",
        "channels": [
          { "index": 0, "description": "Immersion heater 1kW" },
          { "index": 1, "description": "Immersion heater 2kW" },
          { "index": 2, "description": "Hydrophore" },
          { "index": 3, "description": "Boiler" },
          { "index": 4, "description": "Chiller" },
          { "index": 5, "description": "Thermal store" },
          { "index": 6, "description": "(unused)" },
          { "index": 7, "description": "(unused)" }
        ]
      }
```

The __instance__ property value uniquely identifies a switchbank module
by specifying the module's NMEA instance number.

The __type__ property value specifies whether a channel is a switch
input or a relay output module and must be one of the values "switch"
or "relay".

Definitions for switch input modules are optional (the data supplied is
only used for maintenance of switch channel meta values), but
definitions must be provided for any relay output modules that you
expect __signal-switchbank__ to operate. 

The __description__ property values should be used to give the
switchbank and each of its channels a meaningful, human-readable,
description.
These descriptions are used by the plugin to issue delta updates which
insert channel meta keys into the Signal K tree.

Finally, __index__ property values are used to uniquely identify each
channel within a switchbank (note that the first channel should have an
index of zero (the plugin will map the supplied values to the 1-based
indexing used in Signal K path names).

## Debugging and logging

The plugin understands the following debug keys.

| Key                 | Meaning                                         |
|:--------------------|:------------------------------------------------|
| switchbank:\*       | Enable all keys.                                |
| switchbank:state    | Log changes to the plugin's relay state model.  |
| switchbank:commands | Log commands received and issued by the plugin. |
