# pdjr-skplugin-switchbank

Extend support for NMEA 2000 switch banks.

This project implements a plugin for the
[Signal K Node server](https://github.com/SignalK/signalk-server-node).

__pdjr-skplugin-switchbank__ is a plugin which extends Signal K's support
for NMEA 2000 switch banks by (i) providing a mechanism for decorating
switch bank 'state' keys with automatically generated and/or user-supplied
meta data and (ii) allowing a PUT operation on a switch bank relay channel
to operate a remote relay using PGN 127502 (Switch Bank Control) messages.

## System requirements

__pdjr-skplugin-switchbank__ has no special installation requirements.

The meta data support feature relies upon the presence of the
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
    "metainjectorfifo": "/tmp/meta-injector",
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
A populated "switchbanks" array property is all that is required to bring
relay output channels under plugin control: issuing a PUT request on any
of the defined relay channels will result in operation of the associated
remote relay via transmission of PGN 127502 message.

In this example, the optional "metainjectorfifo" property allows the plugin
to issue a minimal, automatically generated, collection of meta data to the
specified FIFO.

### Supplying more elaborate meta data




The configuration consists of a collection of definitions which map
Signal K paths into the plugin's NMEA 2000 operating scheme.
Definitions for switch input modules are optional (the data supplied is
only used for maintenance of switch channel meta values), but
definitions must be provided for any relay output modules that you
expect __pdjr-skplugin-switchbank__ to operate. 

__Switch bank definitions__ [pdjr-skplugin-switchbanks]\
This array property contains a collection of *switchbank definitions*
each of which defines either a switch or a relay switchbank.
Each pdjr-skplugin-switchbank definition has the following properties.

__Switch bank instance__[instance]\
This number property specifies the instance number of the NMEA switch
bank to which this definition applies.

__Switch bank type__[type]\
This string property specifies whether the switch bank is a switch
input module or a relay output module.

__Switch bank description__ [description]\
This string property can be used to give the switch bank a meaningful,
human-readable description which can be used by the plugin for status
and error reporting.

__Switch bank channels__ [channels]\
This array property contains a collection of *channel definitions*
each of which defines the channels which make up the switch bank being
defined.
Each channel definition has the following properties.

__Channel index__ [index]\
This number property uniquely identifies a channel within the switch
bank (the first channel should have an index of one not zero).

__Channel description__ [description]\
This string property can be used to give the switch bank channel a
meaningful, human-readable description which can be used by the plugin
to add meta information to the associated Signal K path.

## Debugging and logging

The plugin understands the 'switchbank' debug key.

## Author

Paul Reeve <preeve@pdjr.eu>\
October 2020
