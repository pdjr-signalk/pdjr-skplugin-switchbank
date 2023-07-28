# pdjr-skplugin-switchbank

NMEA 2000 switchbank support.

## Background

When I had my ship built I wanted a traditional helm and a modern
NMEA 2000 control infrastructure, but the only commercially available
control solutions were "glass helm" products and not to my taste.

I chose to implement a control infrastructure around NMEA 2000
switchbank switch and relay modules and to code a software control
architecture to suit.

The control architecture consists of a Signal K plugin which handles
the logic of what to do when and this plugin which binds Signal K's
logical switchbanks to NMEA 2000 devices out on the NMEA bus.

## Description

This plugin offers two distinct services.

Firstly, it provides a mechanism for decorating Signal K's
'electrical.switches.' hierarchy with user supplied meta-data.
This allows switch banks to be documented in a meaningful way (perhaps
including the device location, product code, serial-number, etc.) and
switch/relay channels to be described in terms of their function or
application.

Secondly, the plugin installs a PUT handler on each defined relay
output channel, supporting state change operations within Signal K and
allowing PUT operations on switch bank relay channels to operate remote
relays using PGN 127502 (Switch Bank Control) messages.

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
