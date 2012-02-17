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

Cu.import("resource://gre/modules/Services.jsm", this);
Cu.import("resource://activities/lib/defaultServices.js");
Cu.import("resource://activities/lib/console.js");
console.log("loading services now");
const NS_XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

const EXPORTED_SYMBOLS = ["MediatorPanel", "activityRegistry", "ServiceInvocationHandler"];

// An 'mediator' is trusted code running with chrome privs.  It gets a chance to
// hook into most aspects of a service operation to add additional value for
// the user.  This might include things like automatically bookmarking
// sites which have been shared etc.  Mediators will be either builtin to
// the User-Agent (ie, into Firefox) or be extensions.
var mediatorClasses = {}; // key is service name, value is a callable.
var mCounter=0;
/**
 * MediatorPanel
 *
 * This class controls the mediator panel UI.  There is one per tab
 * per mediator, created only when needed.
 */
function MediatorPanel(activity) {
  this.methodName = activity.action;
  this.defaultData = {
    activity: {
      action: activity.action,
      type: activity.type,
      data: {}
    }
  };
  this._panelId = mCounter++;

  this.panel = null;
  this.invalidated = true;

  // we use document-element-inserted here rather than
  // content-document-global-created so that other listeners using
  // content-document-global-created will be called before us (e.g. injector.js
  // needs to run first)
  Services.obs.addObserver(this, 'document-element-inserted', false);

  this._createPopupPanel();
}

MediatorPanel.prototype = {
  get window() {
    let wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
    return wm.getMostRecentWindow("navigator:browser");
  },

  startActivity: function(activity, successCB, errorCB) {
    let tabData = {
      activity: activity,
      successCB: successCB,
      errorCB: errorCB
    }
    let tab = this.window.gBrowser.selectedTab;
    if (!tab.activity)
      tab.activity = {};
    tab.activity[this.methodName] = tabData;
    this.invalidated = true;
  },
  
  get tabData() {
    let tab = this.window.gBrowser.selectedTab;
    return tab.activity? tab.activity[this.methodName] : this.defaultData;
  },

  observe: function(document, aTopic, aData) {
    let tb = this.window.document.getElementById('activities-tabbrowser-'+this._panelId);
    if (!tb || aTopic != 'document-element-inserted' ||
        !tb.getBrowserForDocument(document)) return;
    console.log("mediator got document load "+document.location);
    let i = tb.getBrowserIndexForDocument(document);
    let tab = tb.tabs[i];
    if (!tab.service) {
      console.log("no service for tab");
      return
    }
    document.defaultView.addEventListener('load', function(e) {
      console.log("got load, add message listener");
      document.defaultView.removeEventListener('load', arguments.callee, false);
      document.defaultView.addEventListener("message", function(event) {
          console.log("listener received "+event.data + " from "+ event.origin);
      }.bind(this), true);
    }.bind(this), true);
  },

  /**
   * what the panel gets attached to
   * */
  get anchor() {
    return this.window.document.getElementById(this.methodName+'-activity-button') ||
           this.window.document.getElementById('identity-box');
  },

  /**
   * update the arguments that get sent to a mediator, primarily for subclassing
   */
  updateargs: function(data) { return data },

  /**
   * onActivitySuccess
   *
   * the result data is sent back to the content that invoked the service,
   * this may result in data going back to some 3rd party content.  Eg, a
   * website invokes the share mechanism via a share button in its content.
   * the user clicks on the share button in the content, the share panel
   * appears.  When the user complets the share, the result of that share
   * is returned via on_result.
   */
  onActivitySuccess: function(msg) {
    this.panel.hidePopup();
    // the mediator might have seen a failure but offered its own UI to
    // retry - so hide any old error notifications.
    this.hideErrorNotification();
    if (this.tabData.successCB)
      this.tabData.successCB(msg);
  },

  onActivityFailure: function(errob) {
    console.error("mediator reported invocation error:", errob.message)
    this.showErrorNotification(errob);
  },
  
  _processTemplate: function(tmpl, data) {
    let url = tmpl;
    for (var d in data) {
      let repl = "%{"+d+"}";
      url = url.replace(repl, data[d]);
    }
    return url;
  },

  onPanelShown: function() {
    console.log("onPanelShown");
    // nothing to do here yet, but sub-classes might want to override this.
    let tb = this.window.document.getElementById('activities-tabbrowser-'+this._panelId);
    let tab = tb.selectedTab;
    if (tab.service.app.urlTemplate) {
      // our builtins are most likely urlTemplate based share pages, we'll keep
      // it simple and use those for now, with the "upgrade" path being a full
      // activities implementation.
      let url = this._processTemplate(tab.service.app.urlTemplate, this.tabData.activity.data);
      tb.contentWindow.location = url;
    } else {
      try {
        var win = tb.contentWindow;
        console.log("postMessage to "+win.location.protocol + "//" + win.location.host);
        let data = JSON.stringify({
          topic: "activity",
          activity: this.tabData.activity.data
        });
        console.log("   data is "+data);
        win.postMessage(data, win.location.protocol + "//" + win.location.host);
      } catch(e) {
        console.log("postMessage: "+e)
      }
    }
  },

  onPanelHidden: function() {
    // there is a timing issue here when tabs are being switched - as the
    // panel hide event comes the "old" tab is active, but by the time we
    // message the contentScript and it messages back, the "new" tab is
    // active.  So we must take care to remember the "old" tab before doing
    // the message dance.
    console.log("onPanelHidden called");
  },

  /* end message api */
  
  
  _createPanelOverlay: function() {
    // XXX for now, we create a new panel for each mediator method to ensure
    // they are unique per method.
    let document = this.window.document;
    let panel = document.createElementNS(NS_XUL, 'panel');
    panel.setAttribute('id', 'activities-panel-'+this._panelId);
    panel.setAttribute('class', 'activities-panel');
    //panel.setAttribute("noautohide", "true");
    panel.setAttribute("type", "arrow");
    
    let box = document.createElementNS(NS_XUL, 'hbox');
  
    let tabs = document.createElementNS(NS_XUL, 'tabs');
    tabs.setAttribute('id', 'activities-tabs-'+this._panelId);
    tabs.setAttribute('tabbrowser', 'activities-tabbrowser-'+this._panelId);
    tabs.setAttribute('closebuttons', 'hidden');
    tabs.setAttribute('tabsontop', 'false');
    tabs.setAttribute('class', 'tabbrowser-tabs activities-tabs');
    tabs.orient = "vertical";
  
    let tab = document.createElementNS(NS_XUL, 'tab');
    tab.setAttribute('class', 'tabbrowser-tab');
    tab.setAttribute('selected', 'true');
    tab.setAttribute('fadein', 'true');
    tabs.appendChild(tab);
  
    let tb = document.createElementNS(NS_XUL, 'tabbrowser');
    tb.setAttribute('id', 'activities-tabbrowser-'+this._panelId);
    tb.setAttribute('type', 'content');
    tb.setAttribute('class', 'activities-tabbrowser');
    tb.setAttribute('flex', '1');
    tb.setAttribute('tabcontainer', 'activities-tabs-'+this._panelId);
    box.appendChild(tabs);
    box.appendChild(tb);
    panel.appendChild(box);
  
    document.getElementById("mainPopupSet").appendChild(panel);
  
    tb.style.width = "660px";
    tb.style.height = "400px";
    tabs.mTabstrip.orient = "vertical";
    tabs.mCloseButtons = false;
  },

  _createPopupPanel: function() {
    this._createPanelOverlay();
    let window = this.window;
    this.panel = window.document.getElementById('activities-panel-'+this._panelId);
    let tb = window.document.getElementById('activities-tabbrowser-'+this._panelId);
    activityRegistry.get(this.methodName, function(serviceList) {
      // present an ordered selection based on frecency
      serviceList.sort(function(a,b) a.frecency-b.frecency).reverse();
      let empty = tb.selectedTab;
      serviceList.forEach(function(svc) {
        if (!svc.enabled) return;
        let tab = tb.addTab(svc.url);
        tb.pinTab(tab);
        tab.service = svc;
      });
      //tb.pinTab(tb.addTab(require("self").data.url("preferences.html")));
      tb.selectTabAtIndex(0);
      tb.removeTab(empty);
    }.bind(this));
    this.panel.addEventListener('popupshown', this.onPanelShown.bind(this));
    this.panel.addEventListener('popuphidden', this.onPanelHidden.bind(this));
    this.panel.addEventListener('TabSelect', this.onPanelShown.bind(this)); // use onPanelShown to resend activity
  },

  /**
   * show
   *
   * show the mediator popup
   */
  show: function() {
    if (this.invalidated) {
      this.tabData.activity.data = this.updateargs(this.tabData.activity.data);
      this.invalidated = false;
    }
    console.log("showing popup");
    this.panel.openPopup(this.anchor, "bottomcenter topleft");
  },

  /**
   * showErrorNotification
   *
   * show an error notification for this mediator
   */
  showErrorNotification: function(data) {
    let nId = "activities-error-" + this._panelId;
    let nBox = this.window.gBrowser.getNotificationBox();
    let notification = nBox.getNotificationWithValue(nId);

    // Check that we aren't already displaying our notification
    if (!notification) {
      let message;
      if (data && data.message)
        message = data.message;
      else
        message = "There was an error performing this action";

      let self = this;
      buttons = [{
        label: "try again",
        accessKey: null,
        callback: function () {
          self.window.setTimeout(function () {
            self.show();
          }, 0);
        }
      }];
      nBox.appendNotification(message, nId, null,
                  nBox.PRIORITY_WARNING_MEDIUM, buttons);
    }
  },

  /**
   * hideErrorNotification
   *
   * hide notifications from this mediator
   */
  hideErrorNotification: function() {
    let nId = "activities-error-" + this._panelId;
    let nb = this.window.gBrowser.getNotificationBox();
    let notification = nb.getNotificationWithValue(nId);
    if (notification) {
      nb.removeNotification(notification);
    }
  },

  /**
   *  reconfigure
   *
   *  called to add/remove services
   */
  reconfigure: function() {
    // TODO
  }
}

var activityRegistry = {
  _activitiesList: {},
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
  get: function(activityName, cb) {
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
  }
}

/**
 * serviceInvocationHandler
 *
 * Controller for all mediator panels within a single top level window.
 *
 * We create a service invocation panel when needed; there is at most one per
 * tab, but the user can switch away from a tab while a service invocation
 * dialog is still in progress.
 *
 */
function ServiceInvocationHandler(win)
{
  this._popups = []; // save references to popups we've created already

  let observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
  observerService.addObserver(this, "activity-handler-registered", false);
  observerService.addObserver(this, "activity-handler-unregistered", false);
  observerService.addObserver(this, "openwebapp-installed", false);
  observerService.addObserver(this, "openwebapp-uninstalled", false);
  observerService.addObserver(this, "net:clear-active-logins", false);
  
  // if we open a new tab, close any mediator panels
  win.gBrowser.tabContainer.addEventListener("TabOpen", function(e) {
    for each (let mediator in this._popups) {
      if (mediator.panel.state == "open") mediator.panel.hidePopup();
    }
  }.bind(this));
}
ServiceInvocationHandler.prototype = {

  /**
   * registerMediatorClass
   *
   * this is conceptually a 'static' method - once called it will affect
   * all future and current instances of the serviceInvocationHandler.
   *
   */
  registerMediatorClass: function(methodName, callback) {
    if (mediatorClasses[methodName]) {
      throw new Exception("Mediator already registered for "+methodName);
    }
    mediatorClasses[methodName] = callback;
  },

  /**
   * initApp
   *
   * reset our mediators if an app is installed or uninstalled
   */
  observe: function(subject, topic, data) {
    if (topic === "activity-handler-registered" ||
        topic === "activity-handler-unregistered") {
      for each (let popupCheck in this._popups) {
        if (popupCheck.methodName == data)
          popupCheck.reconfigure();
      }
    } else
    if (topic === "openwebapp-installed" ||
        topic === "openwebapp-uninstalled" ||
        topic === "net:clear-active-logins")
    {
      // XXX TODO look at the change in the app and only reconfigure the related
      // mediators.
      for each (let popupCheck in this._popups) {
        popupCheck.reconfigure();
      }
    }
  },

  get: function(activity, successCB, errorCB) {
    for each (let mediator in this._popups) {
      if (activity.action == mediator.methodName) {
        // We are going to replace the existing activity (if any) for the
        // current tab with this new activity - but if there is some
        // mediatorState for that tab we want to keep that.
        activity.mediatorState = mediator.tabData.activity.mediatorState;
        mediator.startActivity(activity, successCB, errorCB);
        return mediator;
      }
    }
    // if we didn't find it, create it
    let klass = mediatorClasses[activity.action] ? mediatorClasses[activity.action] : MediatorPanel;
    let mediator = new klass(activity);
    mediator.startActivity(activity, successCB, errorCB);
    this._popups.push(mediator);
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

console.log(ServiceInvocationHandler);