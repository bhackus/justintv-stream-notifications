/**
 * Model for the channels manager component
 * @author Martin Giger
 * @license MPL-2.0
 * @module channel/manager
 */

"use strict";

const tabs = require("sdk/tabs"),
      self = require("sdk/self"),
     { PageMod } = require("sdk/page-mod"),
     { Task: { async } } = require("resource://gre/modules/Task.jsm"),
     { off, emit, setListeners } = require("sdk/event/core");
const { EventTarget } = require("sdk/event/target");
const { Class: newClass } = require("sdk/core/heritage");
const { MatchPattern } = require("sdk/util/match-pattern");
const { Disposable } = require("sdk/core/disposable");
const { get: _ } = require("sdk/l10n");

const MANAGER_URL_PATTERN = self.data.url("./channels-manager.html") + "*";

/**
 * Store a channel. Listeners should call
 * {@link module:channel/manager.ChannelsManager#onChannelAdded} once the
 * channel was added.
 * @event module:channel/manager.ChannelsManager#addchannel
 * @type {string}
 */
/**
 * Remove a channel (given by its ID) and all users that have it as favorite.
 * Listeners should call
 * {@link module:channel/manager.ChannelsManager#onChannelRemoved} once the
 * channel has been removed.
 * @event module:channel/manager.ChannelsManager#removechannel
 * @type {number}
 */
/**
 * Update a channel (given by its ID). Listeners shoudl call
 * {@link module:channel/manager.ChannelsManager#onChannelUpdated} once the
 * channels has been updated.
 * @event module:channel/manager.ChannelsManager#updatechannel
 * @type {number}
 */
/**
 * Store a user. Listeners should call
 * {@link module:channel/manager.ChannelsManager#onUserAdded} once the user has
 * been added.
 * @event module:channel/manager.ChannelsManager#adduser
 * @type {string}
 */
/**
 * Remove a user (given by it ID). If the second argument is true, delete all
 * its favorited channels, too. Listeners should call
 * {@link module:channel/manager.ChannelsManager#onUserRemoved} once the user
 * was removed.
 * @event module:channel/manager.ChannelsManager#removeuser
 * @type {number}
 */
/**
 * Update the favorites of the given user (by ID) or all users, if no ID was
 * specified. Should call the approriate update callbacks on the ChannelsManager
 * once done.
 * @event module:channel/manager.ChannelsManager#updatefavorites
 * @type {number}
 */
/**
 * Search for accounts of the user on supported sites.
 * @event module:channel/manager.ChannelsManager#autoadd
 *
 */
/**
 * Add all existing channels and users via the on callbacks.
 * @event module:channel/manager.ChannelsManager#getdata
 */

const ChannelsManager = newClass(
/** @lends module:channel/manager.ChannelsManager.prototype */
{
    extends: EventTarget,
    implements: [ Disposable ],
    /**
     * @constructs
     * @argument {Object} options - Event listeners.
     * @extends external:sdk/event/target.EventTarget
     * @implements external:sdk/core/disposable.Disposable
     * @fires module:channel/manager.ChannelsManager#addchannel
     * @fires module:channel/manager.ChannelsManager#removechannel
     * @fires module:channel/manager.ChannelsManager#updatechannel
     * @fires module:channel/manager.ChannelsManager#adduser
     * @fires module:channel/manager.ChannelsManager#removeuser
     * @fires module:channel/manager.ChannelsManager#updatefavorites
     * @fires module:channel/manager.ChannelsManager#autoadd
     * @fires module:channel/manager.ChannelsManager#getdata
     */
    setup(options) {
        setListeners(this, options);

        var onCloseTab = (tab) => {
            console.log("[Manager]> Closed");
            this.managerTab = null;
        };

        this.cancelingValues = new Map();

        this.mod = new PageMod({
            include: MANAGER_URL_PATTERN,
            contentScriptFile: "./channels-manager.js",
            attachTo: ["existing", "top"],
            onAttach: (worker) => {
                console.log("[Manager]> Attached");
                this.loading = true;
                worker.port.on("ready", () => {
                    console.log("[Manager]> Page ready");
                    emit(this, "getdata");
                });
                worker.port.on("adduser", (username, type) => {
                    if(username !== null) {
                        this.loading = true;
                        this.cancelingValues.set("user"+type+username, false);
                        emit(this, "adduser", username, type,
                             () => this.cancelingValues.get("user"+type+username));
                    }
                });
                worker.port.on("autoadd", () => {
                    this.loading = true;
                    emit(this, "autoadd");
                });
                worker.port.on("addchannel", (name, type) => {
                    if(name !== null) {
                        this.loading = true;
                        this.cancelingValues.set("channel"+type+name, false);
                        emit(this, "addchannel", name, type,
                             () => this.cancelingValues.get("channel"+type+name));
                    }
                });
                worker.port.on("cancel", (itemType, type, name) => {
                    this.loading = false;
                    this.cancelingValues.set(itemType+type+name, true);
                });
                worker.port.on("removechannel", (channelId) => {
                    emit(this, "removechannel", channelId);
                });
                worker.port.on("removeuser", (userId, removeFavorites) => {
                    emit(this, "removeuser", userId, removeFavorites);
                });
                worker.port.on("refreshchannel", (channelId) => {
                    this.loading = true;
                    emit(this, "updatechannel", channelId);
                });
                worker.port.on("refreshuser", (userId) => {
                    this.loading = true;
                    emit(this, "updatefavorites", userId);
                });

                worker.on("detach", () => {
                    this.worker = null;
                    if(this.managerTab) {
                        off(this.managerTab, "close", onCloseTab);
                        this.managerTab = null;
                    }
                    console.log("[Manager]> Detached");
                });
                this.worker = worker;
            }
        });

        let pattern = new MatchPattern(MANAGER_URL_PATTERN);

        for(var t in tabs) {
            if(pattern.test(tabs[t].url)) {
                this.managerTab = tabs[t];
                this.managerTab.once("close", onCloseTab);
                break; // there can only be one.
            }
        }

        this._readyListener = (tab) => {
            if(pattern.test(tab.url) && this.managerTab === null) {
                this.managerTab = tab;
                this.managerTab.once("close", onCloseTab);
            }
        };

        tabs.on("ready", this._readyListener);
    },
    /**
     * @type {external:sdk/page-mod.PageMod}
     * @private
     */
    mod: null,
    /**
     * @type {SDKWorker}
     * @private
     */
    worker: null,
    /**
     * @type {external:sdk/tabs.Tab?}
     * @private
     */
    managerTab: null,
    _loading: true,
    /**
     * @type {boolean}
     * @private
     */
    get loading() {
        return this._loading;
    },
    set loading(val) {
        if(this._loading != val) {
            this._loading = val;
            if(this.worker) {
                if(val)
                    this.worker.port.emit("isloading");
                else
                    this.worker.port.emit("doneloading");
            }
        }
    },
    /**
     * Cleans up the canceling value for a request
     */
    _deleteCancelingValue(type, provider, name) {
        this.cancelingValues.delete(type+provider+name);
    },
    /**
     * Selects a manager tab, if one's already opened, else opens one.
     */
    open() {
        if(this.managerTab === null) {
            tabs.open({
                url: "./channels-manager.html"
            });
        }
        else {
            this.managerTab.activate();
        }
    },
    /**
     * Add providers to the list of available providers in the manager.
     * @argument {Object.<module:providers/generic-provider.GenericProvider>} serializedProviders
     */
    addProviders(providers) {
        if(this.worker)
            this.worker.port.emit("addproviders", providers);
    },
    /**
     * Event callback if a channel was added. Callers should call
     * _deleteCancelingValue if invoked from the manager.
     * @argument {module:channel/core.Channel} channelObj - The added channel.
     */
    onChannelAdded(channelObj) {
        this.loading = false;
        if(this.worker)
            this.worker.port.emit("add", channelObj.serialize());
    },
    /**
     * Callback when a channel was removed.
     * @argument {number} channelId - ID of the removed channel.
     */
    onChannelRemoved(channelId) {
        if(this.worker)
            this.worker.port.emit("remove", channelId);
    },
    /**
     * Callback when a channel was updated.
     * @argument {module:channel/core.Channel} channelObj - The updated channel.
     */
    onChannelUpdated(channelObj) {
        this.loading = false;
        if(this.worker)
            this.worker.port.emit("update", channelObj.serialize());
    },
    /**
     * Callback when a user was added. Callers should call _deleteCancelingValue
     * if invoked from the manager.
     * @argument {module:channel/core.User} user - The added user.
     */
    onUserAdded(user) {
        this.loading = false;
        if(this.worker)
            this.worker.port.emit("adduser", user.serialize());
    },
    /**
     * Callback when a user was removed.
     * @argument {number} userId - The ID of the removed user.
     */
    onUserRemoved(userId) {
        if(this.worker)
            this.worker.port.emit("removeuser", userId);
    },
    /**
     * Callback when a user was updated.
     * @argument {module:channel/core.User} user - The user that was updated.
     */
    onUserUpdated(user) {
        this.loading = false;
        if(this.worker)
            this.worker.port.emit("updateuser", user.serialize());
    },
    /**
     * Callback when an error occurs while adding something.
     * @argument {string} name - Name of the object that was to be added.
     * @arguemnt {string} type - Type of the object that was to be added.
     */
    onError(name, type, itemType) {
        this.loading = false;
        this._deleteCancelingValue(itemType,type,name);
        if(this.worker) {
            if(name)
                this.worker.port.emit("error", _("cm_dialog_error", name, type));
            else
                this.worker.port.emit("error", _("cm_dialog_generic_error"));
        }
    },
    onCancel(name, type, itemType) {
        this.loading = false;
        this._deleteCancelingValue(itemType,type,name);
    },
    dispose() {
        if(this.managerTab)
            this.managerTab.close();
        tabs.off("ready", this._readyListener);
        this.mod.destroy();
        this.cancelingValues.clear();
    }
});

exports.ChannelsManager = ChannelsManager;
