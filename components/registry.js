/* -*- Mode: JavaScript; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Contributor(s):
 *  Michael Hanson <mhanson@mozilla.com>
 *	Anant Narayanan <anant@kix.in>
 *	Mark Hammond <mhammond@mozilla.com>
 *	Shane Caraveo <scaraveo@mozilla.com>
 */

const {classes: Cc, interfaces: Ci, utils: Cu,
       resources: Cr, manager: Cm} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://activities/modules/defaultServices.jsm");
Cu.import("resource://activities/modules/mediatorPanel.jsm");
Cu.import("resource://activities/modules/manifestDB.jsm");

const NS_XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const FRECENCY = 100;

// temporary
let console = {
  log: function(s) {
    dump(s + "\n");
  }
}


/**
 * activityRegistry is our internal api for web activities. It
 * holds a registry of installed activity handlers, their mediators, and
 * allows for invoking a mediator for an activity.
 */
function activityRegistry() {
  Services.obs.addObserver(this, "activity-handler-registered", true);
  Services.obs.addObserver(this, "activity-handler-unregistered", true);
  Services.obs.addObserver(this, "openwebapp-installed", true);
  Services.obs.addObserver(this, "openwebapp-uninstalled", true);
  Services.obs.addObserver(this, "document-element-inserted", true);
  
  // first-time install of builtin activities
  for each(let activity in builtinActivities) {
    let info = this._getUsefulness(activity.url, activity.login);
    activity.enabled = info.hasLogin || info.frecency >= FRECENCY;
    ManifestDB.insert(activity);
  }
  
  let self = this;
  ManifestDB.iterate(function(key, activity) {
    //console.log("got manifest from manifestDB " + key + ": " + JSON.stringify(manifest));
    self._addActivity(activity);
  });
}

const activityRegistryClassID = Components.ID("{8d764216-d779-214f-8da0-80e211d759eb}");
const activityRegistryCID = "@mozilla.org/activitiesRegistry;1";

activityRegistry.prototype = {
  classID: activityRegistryClassID,
  contractID: activityRegistryCID,
  QueryInterface: XPCOMUtils.generateQI([Ci.mozIActivitiesRegistry,
                                         Ci.nsISupportsWeakReference,
                                         Ci.nsIObserver]),

  _mediatorClasses: {}, // key is service name, value is a callable.
  _activitiesList: {},
  _byOrigin: {},
  
  _getUsefulness: function ar_findMeABetterName(url, loginHost) {
    let hosturl = Services.io.newURI(url, null, null);
    loginHost = loginHost || hosturl.scheme + "://" + hosturl.host;
    return {
      uri: hosturl,
      hasLogin: hasLogin(loginHost),
      frecency: frecencyForUrl(hosturl.host)
    }
  },
  
  _addActivity: function(activity) {
    if (!this._activitiesList[activity.action])
      this._activitiesList[activity.action] = {};
    if (!this._byOrigin[activity.origin])
      this._byOrigin[activity.origin] = {};

    let info = this._getUsefulness(activity.url, activity.login);
    activity.frecency = info.frecency;
    activity.enabled = activity.enabled!==undefined ?
                              activity.enabled :
                              info.hasLogin || info.frecency >= FRECENCY;
    this._activitiesList[activity.action][activity.origin] = activity;
    this._byOrigin[activity.origin][activity.action] = activity;
  },
  
  _removeActivity: function(action, origin) {
    delete this._activitiesList[action][origin];
    delete this._byOrigin[activity.origin][activity.action];
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
  registerActivityHandler: function ar_registerActivityHandler(aActivityName, aURL, aActivityData) {
    // store by origin.  our builtins get registered first, then we'll register
    // any installed activities, which can overwrite the builtins
    this._addActivity(aActivityData);
    ManifestDB.put(aActivityData);
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
  unregisterActivityHandler: function ar_unregisterActivityHandler(aActivityName, aURL) {
    let activities = this._activitiesList[aActivityName];
    if (!activities)
      return;
    let origin = Services.io.newURI(aURL, null, null).hostname;
    if (!origin)
      return;
    this._removeActivity(aActivityName, origin)
    ManifestDB.remove(aActivityName, aURL, function() {});
    Services.obs.notifyObservers(null, 'activity-handler-unregistered',
                                 aActivityName);
  },

  /**
   * getActivityHandlers
   *
   * get a list of activity handlers
   *
   * @param  string aActivityName     URI or name of activity
   * @param  function aCallback       error callback
   * @result array of jsobj           list of manifests for this activity
   */
  getActivityHandlers: function ar_getActivityHandlers(aActivityName, aCallback) {
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
    }
    catch (e) { }
    aCallback.handle(activities);
  },

  /**
   * registerMediator
   *
   * register a class to be used as the mediator in place of the default
   * mediator class.
   *
   * @param string  aActivityName    URI or name of activity
   * @param jsclass aClass           implementation of MediatorPanel
   */
  registerMediator: function ar_registerMediator(aActivityName, aClass) {
    if (this._mediatorClasses[aActivityName]) {
      throw new Exception("Mediator already registered for " + aActivityName);
    }
    this._mediatorClasses[aActivityName] = aClass;
  },
  
  askUserInstall: function(aWindow, aCallback) {
    // BUG 732263 remember if the user says no, use that as a check in
    // discoverActivity so we bypass a lot of work.
    let nId = "activities-ask-install";
    let nBox = aWindow.gBrowser.getNotificationBox();
    let notification = nBox.getNotificationWithValue(nId);

    // Check that we aren't already displaying our notification
    if (!notification) {
      let message = "This site supports additional functionality for Firefox, would you like to install it?";

      buttons = [{
        label: "Yes",
        accessKey: null,
        callback: function () {
          aWindow.setTimeout(function () {
            aCallback();
          }, 0);
        }
      }];
      nBox.appendNotification(message, nId, null,
                  nBox.PRIORITY_INFO_MEDIUM, buttons);
    }
  },
  
  importManifest: function ar_importManifest(aDocument, location, manifest,
                                             userRequestedInstall) {
    // BUG 732259 we need a persistent storage container for manifest data
    //console.log("got manifest " + JSON.stringify(manifest));
    if (!manifest.activities) {
      console.log("invalid activities manifest");
      return;
    }
    
    let registry = this;
    function installManifest() {
      for each(let svc in manifest.activities) {
        if (!svc.url || !svc.action)
          continue;
        svc.enabled = undefined; // ensure this is not set from the outside
        //console.log("service: " + svc.url);
        svc.url = Services.io.newURI(location, null, null).resolve(svc.url);
        registry.registerActivityHandler(svc.action, svc.url, svc);
      }
    }
    
    if (userRequestedInstall) {
      installManifest();
    }
    else {
      let info = this._getUsefulness(location);
      if (!info.hasLogin && info.frecency < FRECENCY) {
        //console.log("this site simply is not important, skip it");
        return;
      }
      // we reached here because the user has a login or visits this site
      // often, so we want to offer an install to the user
      //console.log("installing " + location + " because " + JSON.stringify(info));
      // prompt user for install
      var xulWindow = aDocument.defaultView
                               .QueryInterface(Ci.nsIInterfaceRequestor)
                               .getInterface(Ci.nsIWebNavigation)
                               .QueryInterface(Ci.nsIDocShellTreeItem)
                               .rootTreeItem
                               .QueryInterface(Ci.nsIInterfaceRequestor)
                               .getInterface(Ci.nsIDOMWindow); 
      this.askUserInstall(xulWindow, installManifest)
      return;
    }
  },
  
  loadManifest: function ar_loadManifest(aDocument, url,
                                                       userRequestedInstall) {
    // BUG 732264 error and edge case handling
    let xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
                .createInstance(Ci.nsIXMLHttpRequest);  
    xhr.open('GET', url, true);
    let registry = this;
    xhr.onreadystatechange = function(aEvt) {
      if (xhr.readyState == 4) {
        if (xhr.status == 200 || xhr.status == 0) {
          //console.log("got response " + xhr.responseText);
          try {
            registry.importManifest(aDocument, url,
                                    JSON.parse(xhr.responseText),
                                    userRequestedInstall);
          }
          catch(e) {
            Cu.reportError(e);
          }
        }
        else {
          console.log("got status " + xhr.status);
        }
      }
    };
    //console.log("fetch " + url);
    xhr.send(null);
  },
  
  discoverActivity: function ar_discoverActivity(aDocument, aData) {
    // BUG 732266 this is probably heavy weight, is there a better way to watch for
    // links in documents?
    
    // TODO determine whether or not we actually want to load this
    // manifest.
    // 1. is it already loaded, skip it, we'll check it for updates another
    //    way
    // 2. does the user have a login for the site, if so, load it
    // 3. does the fecency for the site warrent loading the manifest and
    //    offering to the user?
    let links = aDocument.getElementsByTagName('link');
    for (let index=0; index < links.length; index++) {
      let link = links[index];
      if (link.getAttribute('rel') == 'manifest' &&
          link.getAttribute('type') == 'text/json') {
        //console.log("found manifest url " + link.getAttribute('href'));
        let baseUrl = Services.io.newURI(aDocument.defaultView.location.href,
                                         null, null);
        let url = baseUrl.resolve(link.getAttribute('href'));
        if (!this._byOrigin[baseUrl.host]) {
          this.loadManifest(aDocument, url);
        }
      }
    }
  },

  /**
   * observer
   *
   * reset our mediators if an app is installed or uninstalled
   */
  observe: function ar_observe(aSubject, aTopic, aData) {
    if (aTopic == "document-element-inserted") {
      if (!aSubject.defaultView)
        return;
      //console.log("new document " + aSubject.defaultView.location);
      this.discoverActivity(aSubject, aData);
      return;
    }
    // go through all our windows and reconfigure the panels if necessary
    let windows = Services.wm.getEnumerator("navigator:browser");
    while (windows.hasMoreElements()) {
      let window = windows.getNext();
      let panels = window.document.getElementsByClassName('activities-panel');
      if (aTopic === "activity-handler-registered" ||
          aTopic === "activity-handler-unregistered") {
        // BUG 732271 look at the change in the app and only reconfigure the
        // related mediators.
        for each (let panel in panels) {
          if (panel.mediator.action == aData)
            panel.mediator.reconfigure();
        }
      }
      else if (aTopic === "openwebapp-installed" ||
               aTopic === "openwebapp-uninstalled") {
        // BUG 732271 look at the change in the app and only reconfigure the
        // related mediators.
        for each (let panel in panels) {
          if (panel.mediator.action == aData)
            panel.mediator.reconfigure();
        }
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
  get: function ar_get(aWindow, aActivity) {
    let panels = aWindow.document.getElementsByClassName('activities-panel');
    if (panels.length > 0) {
      for each (let panel in panels) {
        if (aActivity.action == panel.mediator.action) {
          return panel.mediator;
        }
      }
    }
    // if we didn't find it, create it
    let klass = this._mediatorClasses[aActivity.action] ?
                      this._mediatorClasses[aActivity.action] : MediatorPanel;
    return new klass(aWindow, aActivity);
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
  invoke: function ar_invoke(aWindow, aActivity, aSuccessCallback, aErrorCallback) {
    try {
      // Do we already have a panel for this service for this content window?
      let mediator = this.get(aWindow, aActivity);
      mediator.startActivity(aActivity, aSuccessCallback, aErrorCallback);
      mediator.show();
    }
    catch (e) {
      Cu.reportError(e);
    }
  }
};

const components = [activityRegistry];
const NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
