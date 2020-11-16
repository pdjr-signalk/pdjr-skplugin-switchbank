# signalk-switchbank

NMEA 2000 switch bank interface.

This project implements a plugin for the
[Signal K Node server](https://github.com/SignalK/signalk-server-node).

Reading the [Alarm, alert and notification handling](http://signalk.org/specification/1.0.0/doc/notifications.html)
section of the Signal K documentation may provide helpful orientation.

__signalk-switchbank__ implements a control interface for multi-channel
switch and relay modules which operate using the NMEA 2000 Switch Bank
protocol implemented by PGN 127501 (Switch Bank Status) and  PGN 127502
(Switch Bank Control).

PGN 127501 messages are processed natively by Signal K into paths under
"electrical.switches.bank....".
These paths are updated in real time to report the state of every
switch bank channel detected on the host NMEA bus.

__signalk-switchbank__ extends this native support by providing a
mechanism for decorating the switch bank paths built by Signal K with
meta data derived from the plugin configuration file.
Additionally it provides a means of operating switch bank relay modules
in response to PUT requests addressed to relay paths under the plugin's
control.

## Overview

The __signalk-switchbank__ configuration file, ```switchbank.json```,
contains a collection of switchbank definitions which describe the NMEA
2000 switch and relay banks that are under its purview.

### Adding meta information to switch bank paths

__signalk-switchbank__ begins execution by collating descriptive data
for each defined switchbank channel and writing this as a single delta
update of the Signal K paths under "electrical.switches.bank...".

The usefulness of this meta information is documentary, allowing
consumers of switch bank data to present information in a more
accessible way.
For example, the
[signalk-switch-monitor](https://github.com/preeve9534/signalk-switch-monitor)
plugin uses this meta-data to build a switch bank status display.

### Operating NMEA 2000 switch bank relays 

__signalk-switchbank__ attaches to the switch paths of relay modules
specified in its configuration file and listens for Signal K PUT
requests.

When a put request is received which addresses a configured switchbank
relay channel the plugin promptly issues a PGN 127502 NMEA message to
update the state of the specified remote device.

The plugin
[signalk-switchlogic](https://github.com/preeve9534/signalk-switchlogic#readme)
can be used to generate PUT requests the use of this plugin alolngside
__signalk-switchbank__ allows simple and complex switching rules to
directly operate NMEA 2000 relays. 
 
## System requirements

__signalk-switchbank__ has no special installation requirements.

Relay switchbank modules which are to be operated by the plugin must
respond to NMEA 2000 PGN 127502 (Switch Bank Update) messages.

## Installation

Download and install __signalk-switchbank__ using the "Appstore" menu
option in your Signal K Node server console.
The plugin can also be obtained from the 
[project homepage](https://github.com/preeve9534/signalk-switchbank)
and installed using
[these instructions](https://github.com/SignalK/signalk-server-node/blob/master/SERVERPLUGINS.md).

## Configuration

You can maintain the __signalk-switchbank__ configuration using the
Signal K plugin configuration GUI.
The configuration includes the following properties.

__Switch bank definitions__ [switchbanks]\
This array property contains a collection of *switchbank definitions*
each of which defines either as switch or a relay switchbank.
Each switchbank definition has the following properties.

__Switch bank instance__[instance]\
This bumber propery specifies the instance number of the NMEA switch
bank to which this definition applies.

__Switch bank type__[type]\
This string property specifies whether the switch bank is a switch
input module or a relay output module.

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
channel within a switchbank (note that is Signal K style, the first
channel should have an index of one not zero).

## Debugging and logging

The plugin understands the following debug keys.

| Key                 | Meaning                                         |
|:--------------------|:------------------------------------------------|
| switchbank:\*       | Enable all keys.                                |
| switchbank:state    | Log changes to the plugin's relay state model.  |
| switchbank:commands | Log commands received and issued by the plugin. |

## Author

Paul Reeve <preeve@pdjr.eu>\
October 2020
