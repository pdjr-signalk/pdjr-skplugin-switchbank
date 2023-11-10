# pdjr-skplugin-switchbank

NMEA 2000 switchbank support.

## Description

This plugin offers two distinct services.

Firstly, it provides a mechanism for decorating Signal K's
'electrical.switches.' hierarchy with user supplied metadata.
This allows switch banks to be documented in a meaningful way (perhaps
including the device location, product code, serial-number, etc.) and
switch/relay channels to be described in terms of their function or
application.

Secondly, the plugin installs a handler on each defined relay output
channel, which transmits NMEA 2000 relay update messages to the
associated switchbank each time the channel state changes.
Relay switchbank updates can be performed using either
*PGN 127502 Switch Bank Control*
or
*PGN ?????? WTF is this*.

## Configuration

The plugin configuration has the following properties.

| Property    | Default | Description |
| :---------- | :------ | :---------- |
| root        | (none)  | Required string specifying the root under which to perform all switchbank activities. |
| switchbanks | (none)  | Required array of *switchbank* objects. |

*root* should normally be set to 'electrical.switches.bank.'.

A minimal configuration (i.e. one that is sufficient to allow the
operation of remote relays over NMEA 2000) need only provide entries in
the *switchbanks* array for N2K relay output modules, but users may
find it convenient for documentation purposes to provide entries for
all of their N2K switchbank modules, both relay and switch.

Each *switchbank* object has the following properties.

| Property     | Default | Description |
| :----------- | :------ | :---------- |
| instance     | (none)  | Required integer giving the NMEA instance number of the associated switchbank device. |
| channels     | (none)  | Required array of *channel* objects. |
| type         | 'relay' | Optional string, either 'switch' or 'relay' indicating the type of the switchbank device. |
| description  | ''      | Optional string describing the switchbank device. |

If the 'type' property is omittted or set to 'relay' then a put handler
will be installed on each defined output channel which will operate the
remote switchbank.

The 'description' property can usefully include data on the device's
installation location, model/serial number and so on.

Each *channel* object has the following properties.

| Property     | Default | Description |
| :----------- | :------ | :---------- |
| index        | (none)  | Required integer index of the channel in the containing *switchbank*. Note that this value must conform to Signal K enumeration (base 1) rather than an NMEA enumeration which is often base 0. |
| description  | ''      | Optional string describing the switch channel. |

The value of the 'description' property is used by the plugin to
construct the 'displayName' meta property which may be used in some
user-interface and messaging contexts.

## Operation

The plugin must be configured before it can enter production.

Each time the put handler is invoked the transmitted NMEA output
will be displayed on the Signal K dashboard.

## Author

Paul Reeve <*preeve_at_pdjr_dot_eu*>
