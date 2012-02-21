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

  /**
   * registerActivityHandler
   *
   * register the manifest for an activity service provider.
   *
   * @param  string aActivityName     URI or name of activity
   * @param  string aURL              url of handler implementation
   * @param  jsval  aManifest         jsobject of the json manifest 
   */
  registerActivityHandler: function activityRegistry_registerActivityHandler(aActivityName, aURL, aManifest) {
    this.unregisterActivityHandler(aActivityName, aURL);
    if (!this._activitiesList[aActivityName]) this._activitiesList[aActivityName] = {};
    
    // get the frecency for this service
    let hosturl = Services.io.newURI(aURL, null, null);
    let host = hosturl.host;
    let frecency = frecencyForUrl(host);
    let loginHost = aManifest.login || hosturl.scheme+"://"+hosturl.host;
    // for now, hard code at least a frecency of 50 for the service
    // to auto-enable
    let enabled = true;//hasLogin(loginHost) || frecency > 50;
    
    // store by origin.  our builtins get registered first, then we'll register
    // any installed activities, which can overwrite the builtins
    this._activitiesList[aActivityName][hosturl.host] = {
      url: aURL,
      service: aActivityName,
      app: aManifest,
      frecency: frecency,
      enabled: enabled
    };
    Services.obs.notifyObservers(null, 'activity-handler-registered', aActivityName);
  },

  /**
   * unregisterActivityHandler
   *
   * unregister an activity service provider
   *
   * @param  string aActivityName     URI or name of activity
   * @param  string aURL              url of handler implementation
   */
  unregisterActivityHandler: function activityRegistry_unregisterActivityHandler(aActivityName, aURL) {
    let activities = this._activitiesList[aActivityName];
    if (!activities)
      return;
    let origin = Services.io.newURI(aURL, null, null).hostname;
    if (!origin)
      return;
    let activity = this._activitiesList[aActivityName][origin];
    if (activity) {
      delete this._activitiesList[aActivityName][origin];
      Services.obs.notifyObservers(null, 'activity-handler-unregistered', aActivityName);
    }
  },

  /**
   * registerMediatorClass
   *
   * register a class to be used as the mediator in place of the default
   * mediator class.
   *
   * @param  string aActivityName     URI or name of activity
   * @param  function aCallback       error callback
   * @result array of jsobj           list of manifests for this activity
   */
  getActivityHandlers: function activityRegistry_getActivityHandlers(aActivityName, aCallback) {
    let activities = [];
    if (this._activitiesList[aActivityName]) {
      for (var origin in this._activitiesList[aActivityName]) {
        activities.push(this._activitiesList[aActivityName][origin]);
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
    } catch (e) { }
    aCallback(activities);
  },

  /**
   * registerMediatorClass
   *
   * register a class to be used as the mediator in place of the default
   * mediator class.
   *
   * @param string  aActivityName    URI or name of activity
   * @param jsclass aClass           implementation of MediatorPanel
   */
  registerMediatorClass: function activityRegistry_registerMediatorClass(aActivityName, aClass) {
    if (this._mediatorClasses[aActivityName]) {
      throw new Exception("Mediator already registered for "+aActivityName);
    }
    this._mediatorClasses[aActivityName] = aClass;
  },

  /**
   * observer
   *
   * reset our mediators if an app is installed or uninstalled
   */
  observe: function activityRegistry_observe(aSubject, aTopic, aData) {
    let panels = this.window.document.getElementsByClassName('activities-panel');
    if (aTopic === "activity-handler-registered" ||
        aTopic === "activity-handler-unregistered") {
      for each (let panel in panels) {
        if (panel.mediator.action == aData)
          panel.mediator.reconfigure();
      }
    }
    else if (aTopic === "openwebapp-installed" ||
             aTopic === "openwebapp-uninstalled") {
      // XXX TODO look at the change in the app and only reconfigure the related
      // mediators.
      for each (let panel in panels) {
        if (panel.mediator.action == aData)
          panel.mediator.reconfigure();
      }
    }
  },

  /**
   * get
   *
   * Return the mediator instance handling this activity, create one if one
   * does not exist.
   *
   * @param  jsobject activity
   * @return MediatorPanel instance
   */
  get: function activityRegistry_get(aWindow, aActivity) {
    let panels = aWindow.document.getElementsByClassName('activities-panel');
    for each (let panel in panels) {
      if (aActivity.action == panel.mediator.action) {
        return panel.mediator;
      }
    }
    // if we didn't find it, create it
    let klass = this._mediatorClasses[aActivity.action] ?
                      this._mediatorClasses[aActivity.action] : MediatorPanel;
    return new klass(aActivity);
  },

  /**
   * invoke
   *
   * show the panel for a mediator, creating one if necessary.
   * 
   * @param  jsobject aActivity
   * @param  function success callback
   * @param  function error callback
   */
  invoke: function activityRegistry_invoke(aWindow, aActivity, aSuccessCallback, aErrorCallback) {
    try {
      // Do we already have a panel for this service for this content window?
      let mediator = this.get(aWindow, aActivity);
      mediator.startActivity(aActivity, aSuccessCallback, aErrorCallback);
      mediator.show();
    } catch (e) {
      console.log("invoke: "+e);
    }
  }
};

// XXX proper init and shutdown needed
Services.obs.addObserver(activityRegistry, "activity-handler-registered", false);
Services.obs.addObserver(activityRegistry, "activity-handler-unregistered", false);
Services.obs.addObserver(activityRegistry, "openwebapp-installed", false);
Services.obs.addObserver(activityRegistry, "openwebapp-uninstalled", false);

function registerDefaultWebActivities() {
  builtinActivities.forEach(function(activity) {
    activityRegistry.registerActivityHandler(activity.action, activity.url, activity);
  });
}

// XXX global startup for the module
registerDefaultWebActivities();
