# pdjr-skplugin-switchbank

Operate N2K relay output switch banks.

This project implements a plugin for the
[Signal K Node server](https://github.com/SignalK/signalk-server-node).

__pdjr-skplugin-switchbank__ installs a handler on Signal K switch bank
keys that are associated with channels on remote N2K relay modules.
The handler processes received PUT requests, issuing PGN 127502 (Switch
Bank Control) messages to set the remote relay state.

Additionally, the plugin provides a means of automatically generating
and publishing meta data that describes both switch and relay switch
bank keys.
Meta data is published on a user-defined FIFO in a format consistent
with the requirements of the
[pdjr-skplugin-meta-injector](https://github.com/preeve9534/pdjr-skplugin-meta-injector#readme)
plugin.

## System requirements

__pdjr-skplugin-switchbank__ has no special installation requirements.

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

A minimal functional configuration of __pdjr-skplugin-switchbank__
defines N2K relay output modules by specifying their instance number
and the number of supported relay channels.
For example.
```
{
  "enabled": true,
  "enableLogging": false,
  "configuration": {
    "metainjectorfifo": "/tmp/meta-injector",
    "switchbanks": [
      { "instance": 10, "channelcount": 8, "type": "relay" }
      { "instance": 26, "channelcount": 8, "type": "relay" }
      { "instance": 15, "channelcount": 8, "type": "relay" }
      { "instance": 31, "channelcount": 8, "type": "relay" }
    ]
  }
}
```
A populated "switchbanks" array property is all that is required to bring
relay output channels under plugin control: issuing a PUT request on any
of the defined channels will result in operation of the associated remote
relay via PGN.

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
