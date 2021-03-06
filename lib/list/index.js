/**
 * Model for the Panel
 * @author Martin Giger
 * @license MPL-2.0
 * @module list
 * @requires module:channel/utils
 * @requires module:list/firefox
 */

"use strict";

// setup event handling
var { emit, setListeners } = require("sdk/event/core");
var { EventTarget } = require("sdk/event/target");

/**
 * Should open the ChannelsManager.
 * @event module:list.ListView#opencm
 */
/**
 * Passes two arguments: type and login of the channel to add.
 * @event module:list.ListView#addchannel
 */
/**
 * @typedef Style
 * @type {number}
 */
/**
 * @constructor
 * @argument {boolean} live - Initial live state.
 * @argument {module:list~Style} style - Initial panel style.
 * @argument {boolean} extras - Initial visibility of extras.
 * @argument {Object.<module:providers/generic-provider.GenericProvider>} providers
 * @argument {Object} options - Event listeners.
 * @extends external:sdk/core/target.EventTarget
 * @fires module:list.ListView#opencm
 * @fires module:list.ListView#addchannel
 * @alias module:list.ListView
 */
function ListView(live, style, extras, providers, options) {
    setListeners(this, options);
    var liveState = live;

    if(require("sdk/system/xul-app").is("Fennec"))
        this.list = require("./fennec").ListView(live, style);
    else
        this.list = require("./firefox").ListView(live, style, extras);

    Object.defineProperties(this, {
        /**
         * Indicates the live state over all channels.
         * @memberof module:list.ListView
         * @type {boolean}
         */
        "liveState": {
            get: function() {
                return liveState;
            },
            set: (val) => {
                liveState = val;
                this.list.setLiveState(val);
            }
        }
    });

    this.list.on("offline", () => { this.liveState = false; });
    this.list.on("open", (channelId, what) => emit(this, "open", channelId, what));
    this.list.on("refresh", (channelId) => emit(this, "refresh", channelId));
    this.list.on("configure", () => emit(this, "opencm"));
    this.list.on("add", (type, login) => emit(this, "addchannel", type, login));
    this.list.on("pause", () => emit(this, "pause"));
    this.list.on("resume", () => emit(this, "resume"));

    this.list.on("explore", (type) => {
        providers[type].getFeaturedChannels()
            .then((channels) => this.list.setFeatured(channels.map((c) => c.serialize()), type),
                  () => this.list.setFeatured([], type));
    });

    this.list.on("search", (type, q) => {
        providers[type].search(q)
            .then((channels) => this.list.setFeatured(channels.map((c) => c.serialize()), type, q),
                  () => this.list.setFeatured([], type, q));
    });

    this.list.on("ready", () => {
        this.ready = true;
        emit(this, "ready");
    });
}
/**
 * @const {module:list~Style}
 * @default 0
 */
ListView.STYLE_COMPACT   = 0;
/**
 * @const {module:list~Style}
 * @default 1
 */
ListView.STYLE_NORMAL    = 1;
/**
 * @const {module:list~Style}
 * @default 2
 */
ListView.STYLE_THUMBNAIL = 2;

ListView.prototype = Object.create(EventTarget.prototype);
ListView.prototype.constructor = ListView;

/**
 * If the list is ready to get data
 * @type {boolean}
 */
ListView.prototype.ready = false;

/**
 * Instance of the actual view.
 * @type {Object}
 */
ListView.prototype.list  = null;

/**
 * Set the style of the list.
 * @argument {module:list~Style} style
 */
ListView.prototype.setStyle = function(style) {
    this.list.setStyle(style);
};

/**
 * Set the visibility of the extras.
 * @argument {boolean} visible
 */
ListView.prototype.setExtrasVisibility = function(visible) {
    this.list.setExtras(visible);
};

/**
 * Add channels to the list. Updates the live state.
 * @argument {Array.<module:channel/core.Channel>} channels
 */
ListView.prototype.addChannels = function(channels) {
    if(channels.some((channel) => channel.live))
        this.liveState = true;
    this.list.addChannels(channels.map((c) => c.serialize()));
};
/**
 * Remove a channel from the list. Updates the liveState if appropriate.
 * @argument {number} channelId - ID of the channel to remove.
 */
ListView.prototype.removeChannel = function(channelId) {
    this.list.removeChannel(channelId);
};
/**
 * Mark a channel as live. Also updates the liveState. Can also be user to
 * update the info of a channel.
 * @argument {module:channel/core.Channel} channel
 */
ListView.prototype.setChannelLive = function(channel) {
    this.list.setOnline(channel.serialize());
    this.liveState = true;
};
/**
 * Mark a channel as offline. Also updates liveState if appropriate.
 * @argument {module:channel/core.Channel} channel
 */
ListView.prototype.setChannelOffline = function(channel) {
    this.list.setOffline(channel.serialize());
};

/**
 * Set the available providers.
 * @argument {Object.<module:providers/generic-provider.GenericProvider>} serializedProviders
 */
ListView.prototype.setProviders = function(serializedProviders) {
    this.list.setProviders(serializedProviders);
};

/**
 * Indicate if the update queue is running in the background or not.
 */
ListView.prototype.setQueueStatus = function(enabled) {
    this.list.setQueueStatus(enabled);
};

/**
 * Indicate if the queue is temporarily paused.
 */
ListView.prototype.setQueuePaused = function(paused) {
    this.list.setQueuePaused(paused);
};

/**
 * Something with the channel changed. Performs appropriate actions based on the
 * state of the channel. Updates liveState if appropriate.
 * @argument {module:channel/core.Channel} channel
 */
ListView.prototype.onChannelChanged = function(channel) {
    console.log("updating state for", channel.login);
    if(channel.live)
        this.setChannelLive(channel);
    else
        this.setChannelOffline(channel);
};

exports.ListView = ListView;
