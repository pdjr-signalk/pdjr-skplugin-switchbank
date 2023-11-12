# pdjr-skplugin-switchbank

NMEA 2000 switchbank support.

## Description

**pdjr-signalk-switchbank** operates relays on NMEA 2000 compliant
physical relay output devices in response to state changes on their
associated Signal K switchbank model.

Each time a Signal K PUT request is received on a configured relay
output channel the plugin issues an NMEA 2000 *PGN 127502 Switch Bank
Control* message (or, if configured, a *PGN ?????? WTF is this*
message) to operate the remote relay.

The plugin also supports decorating Signal K's 'electrical.switches.'
hierarchy with user supplied metadata, allowing Signal K switchbanks
to be described in a meaningful way (perhaps including the device
location, product code, serial-number, etc.) and switch/relay channels
to be described in terms of their function or application.

## Configuration

<dl>
  <dt>Root path for all switchbank keys <code>root</code></dt>
  <dd>
    Optional string specifying the Signal K root under which the plugin
    will conduct all switchbank activities.
    Defaults to 'electrical.switches.bank.'.
  </dd>
  <dt>Metadata publication service configuration <code>metadataPublisher</code></dt>
  <dd>
    Optional object configuring access to a remote metadata publication
    service (a suitable service is implemented by the author's
    <a href='https://github.com/pdjr-signalk/pdjr-skplugin-metadata#readme'>metadata plugin</a>.
    <p>
    If this property is omitted, or if, for whatever reason, metadata cannot
    be published to the specified service then the plugin will inject metadata
    directly into the Signal K tree.</p>
    <dl>
      <dt>Metadata publication endpoint <code>endpoint</code></dt>
      <dd>
        Required URL of an API which will accept Signal K metadata and
        at least insert it into the Signal K tree.
        For example '/plugins/metadata/metadata'.
      </dd>
      <dt>Metadata publication method <code>method</code></dt>
      <dd>
        Optional string specifying the HTTP method which should be used
        to submit metadata to the publication service.
        Defaults to 'POST', but 'PUT' or 'PATCH' may be specified.
      </dd>
      <dt>Metadata publisher credentials <code>credentials</code></dt>
      <dd>
        Required string of the form 'username:password' specifying
        Signal K credentials that will allow access to the publication
        service. 
      </dd>
    </dl>
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
      <dt>Switchbank instance number <code>instance</code></dt>
      <dd>
        Required integer giving the NMEA instance number of the
        switchbank device.
        Typically, this value is set on the hardware device and read
        automatically by Signal K.
      </dd>
      <dt>Switchbank type <code>type</code></dt>
      <dd>
        Optional string value, either 'switch' or 'relay', specifying
        whether the switchbank is a switch input or relay output
        device.
        Defaults to 'relay'.
      </dd>
      <dt>Number of channels supported by this switchbank <code>channelCount</code></dt>
      <dd>
        Optional number value specifying the number of switch or relay
        channels supported by this switchbank.
      </dd>
      <dt>PGN used to update this switchbank <code>pgn</code></dt>
      <dd>
        Optional string value for 'relay' switchbanks (ignored by
        'switch' switchbanks) which specifies the PGN used to update
        the switchbank state.
        The plugin supports '127502' and '??????' and defaults to
        '127502'.
      </dd>
      <dt>Text describing the module <code>description</code></dt>
      <dd>
        Optional string describing the switchbank device.
        This value can usefully include data on the device's
        installation location, model/serial number and so on.
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
            (base 1) rather than an NMEA enumeration which is often
            base 0.
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
