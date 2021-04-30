# pdjr-skplugin-switchbank

Extend support for NMEA 2000 switch banks.

This project implements a plugin for the
[Signal K Node server](https://github.com/SignalK/signalk-server-node).

__pdjr-skplugin-switchbank__ is a plugin which extends Signal K's support
for NMEA 2000 switch banks by (i) providing a mechanism for decorating
switch bank 'state' keys with automatically generated and/or user-supplied
meta data and (ii) allowing PUT operations on switch bank relay channels
to operate remote relays using PGN 127502 (Switch Bank Control) messages.

## System requirements

__pdjr-skplugin-switchbank__ has no special installation requirements.

Adding meta data to switch bank keys relies upon the presence of the
[pdjr-skplugin-meta-injector](https://github.com/preeve9534/pdjr-skplugin-meta-injector#readme)
plugin which has responsibility for writing generated meta data into
the Signal K data store.

Relay switch bank modules which are to be operated by the plugin must
respond to NMEA 2000 PGN 127502 (Switch Bank Control) messages.

## Installation

Download and install __pdjr-skplugin-switchbank__ using the "Appstore" menu
option in your Signal K Node server console.
The plugin can also be obtained from the 
[project homepage](https://github.com/preeve9534/pdjr-skplugin-switchbank)
and installed using
[these instructions](https://github.com/SignalK/signalk-server-node/blob/master/SERVERPLUGINS.md).

## Using the plugin

__pdjr-skplugin-switchbank__ operates autonomously, but must be configured
before use.

The plugin configuration is held in ```pdjr-skplugin-switchbank.json```
which can be edited directly or maintained using the Signal K plugin
configuration interface.

### Configuring relay operation

A minimal configuration (i.e. one that is sufficient to allow the operation
of remote relays) need only specify N2K relay modules, but most users will
find it convenient for documentation purposes to specify all of their N2K
switchbank modules, both relay and switch.
My ship has two 16-channel switch input modules and four 8-channel relay
output modules and a minimal configuration looks like this:
```
{
  "enabled": true,
  "enableLogging": false,
  "configuration": {
    "switchbanks": [
      { "instance": 0, "channelcount": 16, "type": "switch" },
      { "instance": 16, "channelcount": 16, "type": "switch" },
      { "instance": 10, "channelcount": 8, "type": "relay" },
      { "instance": 26, "channelcount": 8, "type": "relay" },
      { "instance": 15, "channelcount": 8, "type": "relay" },
      { "instance": 31, "channelcount": 8, "type": "relay" }
    ]
  }
}
```
The presense of a "relay" entry in the "switchbanks" array is all that is
required to make the specified module's relay outputs operable by Signal K
PUT requests.

### Enabling metadata output

To inject meta data into the Signal K tree you must run the __pdjr-skplugin-meta-injector__
plugin which listens on a user-define FIFO port for meta data updates.

Adding a "metainjectorfifo" property to the configuration allows the plugin
to issue some minimal, automatically generated, meta data via the specified
FIFO to __pdjr-skplugin-meta-injector__.
```
{
  "enabled": true,
  "enableLogging": false,
  "configuration": {
    "metainjectorfifo": "/tmp/meta-injector",
    "switchbanks": [
      { "instance": 0,  "channelcount": 16, "type": "switch", "description": "Helm switch input" },
      { "instance": 16, "channelcount": 16, "type": "switch"  "description": "Domestic panel switch input" },
      { "instance": 10, "channelcount": 8,  "type": "relay"   "description": "Engine room relay bank 1" },
      { "instance": 26, "channelcount": 8,  "type": "relay"   "description": "Engine room relay bank 2" },
      { "instance": 15, "channelcount": 8,  "type": "relay"   "description": "Forecabin relay bank 1" },
      { "instance": 31, "channelcount": 8,  "type": "relay"   "description": "Forecabin relay bank 2" }
    ]
  }
}
```
This example also illustrates how a "description" property can be added to
each switch bank definition.
The "description" property value is used by the plugin to make status and
error reporting more intelligible.

### Supplying more elaborate meta data

A "channels" array property containing a collection of channel meta data
objects can be added to each switch bank definition.
Each object should include "index" and "description" properties which
identify and describe a channel: te supplied description is added to the
meta data issued by the plugin.

The following example illustrates how this feature might be used to extend
a switchbank configuration.

```
...
    "switchbanks": [
      {
        "instance": 0,
        "channelcount": 16,
        "type": "switch",
        "description": "Helm switch input",
        "channels": [
          { "index": 1, "description": "Navigation lights" },
          { "index": 2, "description": "Anchor light" },
          ...
        ]
      },
      ...
    ]
...
```

## Author

Paul Reeve \<preeve@pdjr.eu\>\
October 2020
