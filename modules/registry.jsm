/* -*- Mode: JavaScript; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Open Web Apps for Firefox.
 *
 * The Initial Developer of the Original Code is The Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *  Michael Hanson <mhanson@mozilla.com>
 *	Anant Narayanan <anant@kix.in>
 *	Mark Hammond <mhammond@mozilla.com>
 *	Shane Caraveo <scaraveo@mozilla.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const {classes: Cc, interfaces: Ci, utils: Cu, resources: Cr} = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://activities/modules/defaultServices.jsm");
Cu.import("resource://activities/modules/mediatorPanel.jsm");

const NS_XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

const EXPORTED_SYMBOLS = ["activityRegistry"];

// temporary
let console = {
  log: function(s) {
    dump(s+"\n");
  }
}

/**
 * activityRegistry is our internal js/xul window api for web activities.  It
 * holds a registry of installed activity handlers, their mediators, and
 * allows for invoking a mediator for an activity.
 */
var activityRegistry = {
  _mediatorClasses: {}, // key is service name, value is a callable.
  _activitiesList: {},

  get window() {
    let wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
    return wm.getMostRecentWindow("navigator:browser");
  },

  registerActivityHandler: function(activity, uri, data) {
    this.unregisterActivityHandler(activity, uri);
    if (!this._activitiesList[activity]) this._activitiesList[activity] = {};
    
    // get the frecency for this service
    let hosturl = Services.io.newURI(uri, null, null);
    let host = hosturl.host;
    let frecency = frecencyForUrl(host);
    let loginHost = data.login || hosturl.scheme+"://"+hosturl.host;
    // for now, hard code at least a frecency of 50 for the service
    // to auto-enable
    let enabled = true;//hasLogin(loginHost) || frecency > 50;
    
    // store by origin.  our builtins get registered first, then we'll register
    // any installed activities, which can overwrite the builtins
    this._activitiesList[activity][hosturl.host] = {
      url: uri,
      service: activity,
      app: data,
      frecency: frecency,
      enabled: enabled
    };
    Services.obs.notifyObservers(null, 'activity-handler-registered', activity);
  },

  unregisterActivityHandler: function(action, uri) {
    let activities = this._activitiesList[action];
    if (!activities)
      return;
    let origin = Services.io.newURI(uri, null, null).hostname;
    if (!origin)
      return;
    let activity = this._activitiesList[action][origin];
    if (activity) {
      delete this._activitiesList[action][origin];
      Services.obs.notifyObservers(null, 'activity-handler-unregistered', activity);
    }
  },

  getActivityHandlers: function(activityName, cb) {
    let activities = [];
    if (this._activitiesList[activityName]) {
      for (var origin in this._activitiesList[activityName]) {
        activities.push(this._activitiesList[activityName][origin]);
      }
    }
    try {
      // the owa api will need to be xpcom or something, we cannot import
      // addon-sdk files from an external addon
      //var {FFRepoImplService} = require("openwebapps/api");
      //FFRepoImplService.findServices(activityName, function(serviceList) {
      //  // make a combo list of our internal activities and installed apps
      //  activities = activities.concat(serviceList);
      //  cb(activities);
      //});
    } catch (e) {
    }
    cb(activities);
  },

  /**
   * registerMediatorClass
   *
   * register a class to be used as the mediator in place of the default
   * mediator class.
   *
   */
  registerMediatorClass: function(methodName, callback) {
    if (this._mediatorClasses[methodName]) {
      throw new Exception("Mediator already registered for "+methodName);
    }
    this._mediatorClasses[methodName] = callback;
  },

  /**
   * initApp
   *
   * reset our mediators if an app is installed or uninstalled
   */
  observe: function(subject, topic, data) {
    let panels = this.window.document.getElementsByClassName('activities-panel');
    if (topic === "activity-handler-registered" ||
        topic === "activity-handler-unregistered") {
      for each (let panel in panels) {
        if (panel.mediator.methodName == data)
          panel.mediator.reconfigure();
      }
    } else
    if (topic === "openwebapp-installed" ||
        topic === "openwebapp-uninstalled" ||
        topic === "net:clear-active-logins")
    {
      // XXX TODO look at the change in the app and only reconfigure the related
      // mediators.
      for each (let panel in panels) {
        if (panel.mediator.methodName == data)
          panel.mediator.reconfigure();
      }
    }
  },

  get: function(activity, successCB, errorCB) {
    let panels = this.window.document.getElementsByClassName('activities-panel');
    for each (let panel in panels) {
      if (activity.action == panel.mediator.methodName) {
        // We are going to replace the existing activity (if any) for the
        // current tab with this new activity - but if there is some
        // mediatorState for that tab we want to keep that.
        activity.mediatorState = panel.mediator.tabData.activity.mediatorState;
        panel.mediator.startActivity(activity, successCB, errorCB);
        return panel.mediator;
      }
    }
    // if we didn't find it, create it
    let klass = this._mediatorClasses[activity.action] ?
                      this._mediatorClasses[activity.action] : MediatorPanel;
    let mediator = new klass(activity);
    mediator.startActivity(activity, successCB, errorCB);
    return mediator;
  },

  /**
   * invoke
   *
   * show the panel for a mediator, creating one if necessary.
   */
  invoke: function(activity, successCB, errorCB) {
    try {
      // Do we already have a panel for this service for this content window?
      let mediator = this.get(activity, successCB, errorCB);
      mediator.hideErrorNotification();
      mediator.show();
    } catch (e) {
      console.log(e);
    }
  }
};

// XXX proper init and shutdown needed
Services.obs.addObserver(activityRegistry, "activity-handler-registered", false);
Services.obs.addObserver(activityRegistry, "activity-handler-unregistered", false);
Services.obs.addObserver(activityRegistry, "openwebapp-installed", false);
Services.obs.addObserver(activityRegistry, "openwebapp-uninstalled", false);
Services.obs.addObserver(activityRegistry, "net:clear-active-logins", false);

function registerDefaultWebActivities() {
  builtinActivities.forEach(function(activity) {
    activityRegistry.registerActivityHandler(activity.action, activity.url, activity);
  });
}

// XXX global startup for the module
registerDefaultWebActivities();
