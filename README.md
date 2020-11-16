# switchbank

Operate N2K relay switch banks.

This project implements a plugin for the
[Signal K Node server](https://github.com/SignalK/signalk-server-node).

Reading the [Alarm, alert and notification handling](http://signalk.org/specification/1.0.0/doc/notifications.html)
section of the Signal K documentation may provide helpful orientation.

__switchbank__ implements a control interface for multi-channel relay
modules which operate using the NMEA 2000 Switch Bank protocol
implemented by PGN 127501 (Switch Bank Status) and  PGN 127502 (Switch
Bank Control).

PGN 127501 messages are processed natively by Signal K into paths under
"electrical.switches.bank....".
These paths are updated in real time to report the state of every
switch bank channel detected on the host NMEA bus.

__switchbank__ extends this native support by providing a mechanism for
operating switch bank relay modules in response to PUT requests
addressed to relay paths under the plugin's control.

Additionally, the plugin provides a means of decorating switch bank
paths (both switch and relay) with meta data derived from the plugin
configuration file.

## System requirements

__switchbank__ has no special installation requirements.

Relay switch bank modules which are to be operated by the plugin must
respond to NMEA 2000 PGN 127502 (Switch Bank Control) messages.

## Installation

Download and install __switchbank__ using the "Appstore" menu option in
your Signal K Node server console.
The plugin can also be obtained from the 
[project homepage](https://github.com/preeve9534/signalk-switchbank)
and installed using
[these instructions](https://github.com/SignalK/signalk-server-node/blob/master/SERVERPLUGINS.md).

## Configuration

You can maintain the __switchbank__ configuration using the Signal K
plugin configuration GUI.
The configuration includes the following properties.

__Switch bank definitions__ [switchbanks]\
This array property contains a collection of *switchbank definitions*
each of which defines either as switch or a relay switchbank.
Each switchbank definition has the following properties.

Definitions for switch input modules are optional (the data supplied is
only used for maintenance of switch channel meta values), but
definitions must be provided for any relay output modules that you
expect __switchbank__ to operate. 

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
