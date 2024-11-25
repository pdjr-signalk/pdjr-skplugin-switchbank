# pdjr-skplugin-switchbank

NMEA 2000 switchbank support.

## Description

**pdjr-signalk-switchbank** operates relays on NMEA 2000 compliant
physical relay output devices in response to state change requests
on their associated Signal K switchbank model.

Each time a Signal K PUT request on a configured relay switchbank
channel requires a state change, the plugin issues an NMEA 2000
*PGN 127502 Switch Bank Control* message (or, if configured, a
*PGN ?????? WTF is this* message) to operate the remote relay.

As well as operating remote relays, the plugin injects metadata into
Signal K's 'electrical.switches.' hierarchy with user supplied metadata
allowing Signal K switchbanks to be described in a meaningful way
(perhaps including the device location, product code, serial-number,
etc.) and their switch/relay channels to be described in terms of
function or application.

## Configuration

<dl>
  <dt>Root path for switchbank keys <code>root</code></dt>
  <dd>
    <p>
    Optional string specifying the Signal K root under which the plugin
    will create switchbank nodes.
    </p><p>
    Defaults to 'electrical.switches.bank.'.
    </p>
  </dd>
  <dt>Switchbank definitions <code>switchbanks</code></dt>
  <dd>
    <p>
    Array of <em>switchbank</em> objects each of which defines an NMEA
    switchbank.
    </p>
    <p>
    A minimal configuration (i.e. one that is sufficient to allow the
    operation of remote relays over NMEA 2000) need only provide
    entries in the *switchbanks* array for N2K relay output modules,
    but users may find it convenient for documentation purposes to
    provide entries for all of their N2K switchbank modules, both relay
    and switch.
    </p>
    <p>
    Each <em>switchbank</em> object has the following properties.
    </p>
    <dl>
      <dt>Instance number <code>instance</code></dt>
      <dd>
        <p>
        Required integer giving the NMEA instance number of the
        switchbank device.
        </p><p>
        This value must be the same as that set on the associated
        hardware device.
        </p>
      </dd>
      <dt>Switchbank type <code>type</code></dt>
      <dd>
        <p>
        Optional string value, either 'switch' or 'relay', specifying
        whether the switchbank is a switch input or relay output
        device.
        </p><p>
        Defaults to 'relay'.
        </p>
      </dd>
      <dt>PGN used to update this switchbank <code>pgn</code></dt>
      <dd>
        <p>
        Optional number value which specifies the PGN used to update
        the associated relay switchbank (not required for switch
        switchbanks).
        The plugin supports 127502 and ??????.
        </p><p>
        Defaults to 127502.
        </p>
      </dd>
      <dt>Text describing the switchbank <code>description</code></dt>
      <dd>
        <p>
        Optional string describing the switchbank device.
        </p><p>
        This value can usefully include data on the device's
        installation location, model/serial number and so on.
        </p><p>
        Defaults to 'Switchbank *instance*'.
        </p>
      </dd>
      <dt>Switchbank channels <code>channels</code></dt>
      <dd>
        This array consists of *channel* objects each of which
        describes a single channel on the containing switchbank.
        <dl>
          <dt>Channel index <code>index</code></dt>
          <dd>
            Required number property that identifies this channel on
            the switchbank.
            Note that this value must conform to Signal K enumeration
            (base 1) rather than the NMEA enumeration (base 0).
          </dd>
          <dt>Channel description <code>description</code></dt>
          <dd>
            Optional string describing the switch channel.
            The supplied value is used by the plugin to construct the
            metadata 'displayName' roperty which may be used in some
            user-interface and messaging contexts.
          </dd>
        </dl>
      </dd>
    </dl>
  </dd>
</dl>

## Operation

The plugin must be configured before it can enter production.

As soon as the plugin starts, metadata for all configured switchbanks
and channels is injected into Signal K and PUT handlers are installed
on all configured relay output channels.

Each time a PUT request triggers a state change on a configured channel
the NMEA message issued by the plugin is displayed on the Signal K
dashboard.

## Author

Paul Reeve <*preeve_at_pdjr_dot_eu*>
