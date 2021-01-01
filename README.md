# signalk-switchbank

Operate N2K relay output switch banks.

This project implements a plugin for the
[Signal K Node server](https://github.com/SignalK/signalk-server-node).

__signalk-switchbank__ extends Signal K's native switch bank support by
providing a mechanism for operating switch bank relay modules (using
PGN 127502) in response to PUT requests addressed to switch bank paths
under the plugin's control.

Additionally, the plugin provides a means of automatically generating
switch state meta data for both switch and relay modules in a form that
can be consumed by the
[signalk-meta](https://github.com/preeve9534/signalk-meta#readme)
plugin.

## System requirements

__signalk-switchbank__ has no special installation requirements.

Relay switch bank modules which are to be operated by the plugin must
respond to NMEA 2000 PGN 127502 (Switch Bank Control) messages.

## Installation

Download and install __signalk-switchbank__ using the "Appstore" menu
option in your Signal K Node server console.
The plugin can also be obtained from the 
[project homepage](https://github.com/preeve9534/signalk-switchbank)
and installed using
[these instructions](https://github.com/SignalK/signalk-server-node/blob/master/SERVERPLUGINS.md).

## Using the plugin

__signalk-switchbank__ operates autonomously, but must be configured
before use.

### Basic configuration (no meta data support)

A minimal configuration of __signalk-switchbank__ supplies just enough
information for the plugin to respond to PUT requests targetted at
switch keys which are associated with relay output switch banks.

For a vessel with four 8-channel relay output modules this might be
something as simple as:
```
switchbanks: [
  { instance: 10, channelcount: 8, type: "relay" }
  { instance: 26, channelcount: 8, type: "relay" }
  { instance: 15, channelcount: 8, type: "relay" }
  { instance: 31, channelcount: 8, type: "relay" }
]
```



The plugin configuration is stored in the file 'switchbank.json' and
can be maintained using the Signal K plugin configuration GUI.

The configuration consists of a collection of definitions which map
Signal K paths into the plugin's NMEA 2000 operating scheme.
Definitions for switch input modules are optional (the data supplied is
only used for maintenance of switch channel meta values), but
definitions must be provided for any relay output modules that you
expect __signalk-switchbank__ to operate. 

__Switch bank definitions__ [signalk-switchbanks]\
This array property contains a collection of *switchbank definitions*
each of which defines either a switch or a relay switchbank.
Each signalk-switchbank definition has the following properties.

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
