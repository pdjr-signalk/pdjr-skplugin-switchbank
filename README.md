# signalk-nmearelay

Operate NMEA 2000 relay output modules.

This project implements a plugin for the
[Signal K Node server](https://github.com/SignalK/signalk-server-node).

Reading the [Alarm, alert and notification handling](http://signalk.org/specification/1.0.0/doc/notifications.html)
section of the Signal K documentation may provide helpful orientation.

__signalk-nmearelay__ provides an interface for NMEA 2000 compliant
switchbank relay modules which can be operated by PGN127502 Switch Bank
Control messages.

The plugin listens on a control channel for messages which command
a state change on a relay channel and immediately implements the
requested change by issuing a PGN 127502 Switch Bank Update message
over the NMEA bus.

The control channel monitored by __signalk-nmearelay__ can be a Signal
K notification channel, a Unix domain FIFO or a dbus channel. The
plugin easily interfaces to
[signalk-switchlogic](https://github.com/preeve9534/signalk-switchlogic)
and this combination allows arbitrarily complex switch control logic to
operate NMEA relay outputs.

The plugin can also be used to elaborate paths in the
"electrical.switches.bank..." tree with meta-data which, *inter-alia*,
can allow consumers of switchbank data to present information in a more
accessible way.
[signalk-switch-monitor](https://github.com/preeve9534/signalk-switch-monitor)
is an example of an application which does this.

## System requirements

__signalk-nmearelay__ has no special installation requirements.

Relay switchbank modules which are to be operated by the plugin must
respond to NMEA 2000 PGN 127502 (Switch Bank Update).

## Installation

Download and install __signalk-nmearelay__ using the "Appstore" menu
option in your Signal K Node server console.
The plugin can also be obtained from the 
[project homepage](https://github.com/preeve9534/signalk-nmearelay)
and installed using
[these instructions](https://github.com/SignalK/signalk-server-node/blob/master/SERVERPLUGINS.md).

## Using the plugin

__signalk-nmearelay__ autonomously reacts to the commands it receives,
but before use it must be configured to suit your needs.
The plugin can be configured using the Signal K Node server plugin
configuration GUI, but this rather limited interface gets in the way
of an otherwise straightforward task: it is simpler to directly edit
the plugin's JSON configuration file using your preferred text editor.
 
The plugins looks for the configuration file 'nmearelay.json' in the
server's 'plugin-config-data/' directory.
This file must have the following general structure:
```
{
  "enabled": false,
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
The configurations string must consist of two, colon-delimited, fields:

    "*channel-type*__:__*channel-id*"

There are three valid *channel-type* options.

1. notification - listen on a Signal K notification path. This is the
   simplest option, requiring no operating system configuration and is
   the preferred choice because it directly interfaces with the
   commands issued by __signalk-switchlogic__. In this scheme,
   *channel-id* identifies a Signal K notification path on which the
   plugin should listen. 

2. Listen on a Unix domain FIFO. Not yet implemented.

3. Listen on a dbus channel. Not yet implemented.

 
The __switchbanks__ array is used to define the NMEA 2000 switchbanks
which are of interest to the plugin.
Amongst other things, these definitions are used to inject meta paths 
into the Signal K "electrical.switches...." tree, elaborating the basic
state information which is automatically maintained by Signal K.

A single entry in the __switchbanks__ array defines a single
switchbank.
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

The __description__ property values should be used to give the
switchbank and each of its channels a meaningful, human-readable,
description.
These descriptions are used by the plugin to issue delta updates which
insert channel meta keys into the Signal K tree.

Finally, __index__ property values are used to uniquely identify each
channel within a switchbank (note that the first channel should have an
index of zero - for some reason, the Signal K convention in path names
is to start counting channels from 1: don't do that let the plugin work
it out).

## Command format

__signalk-nmearelay__ expects to receive JSON commands as a text string
of the sort generated by JSON.stringify().
Parsing a command string should yield an object of the form:
```
{
  "moduleid": "*moduleid*",    // relay module instance number
  "channelid": "*channelid*",  // relay channel index number
  "state": "*state*"           // "0" or "1" (for OFF/ON)
}
```

When the command channel is of the "notification" type, then the
command string is assumed to be the value of the notification's
description property.

## Debugging and logging

__signalk-nmearelay__ uses the standard Signal K logging mechanism
based around the idea of debug keys (you can access the relevant GUI
from your server console menu Server -> Server Log).

The plugin understands the following debug keys.

| Key | Meaning                                                                                                                    |
|:-------------------|:------------------------------------------------------------------------------------------------------------|
| nmearelay:\*       | Enable all keys.                                                                                            |
| nmearelay:state    | Log all received PGN 127501 Switch Bank Status messages.                                                    |
| nmearelay:commands | Log all commands received and issued by the plugin.                                                         |
