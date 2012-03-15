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

const {classes: Cc, interfaces: Ci, utils: Cu, resources: Cr} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

const NS_XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

// other Mediators may subclass our default mediator
const EXPORTED_SYMBOLS = ["MediatorPanel"];

const PREFS_URL = "chrome://activities/content/preferences.html";
// TODO BUG 735885 get a proper icon
const PREFS_ICON = "chrome://browser/skin/tabbrowser/newtab.png";

XPCOMUtils.defineLazyServiceGetter(this, "activityRegistry",
  "@mozilla.org/activitiesRegistry;1", "mozIActivitiesRegistry");

// temporary
let console = {
  log: function(s) {
    dump(s + "\n");
  }
}

/**
 * MediatorPanel
 *
 * This class controls the mediator panel UI.  There is one per tab
 * per mediator, created only when needed.
 */
function MediatorPanel(aWindow, activity) {
  // DO NOT keep a reference to aWindow
  this.action = activity.action;
  this.defaultData = {
    activity: {
      action: activity.action,
      type: activity.type,
      data: ""
    }
  };
  this._panelId = btoa(this.action);

  this.invalidated = true;

  // we use document-element-inserted here rather than
  // content-document-global-created so that other listeners using
  // content-document-global-created will be called before us.
  Services.obs.addObserver(this, 'document-element-inserted', false);

  this._createPopupPanel(aWindow);
}

MediatorPanel.prototype = {
  get panel() {
    return this._panel;
  },
  
  get tabbrowser() {
    return this._panel.ownerDocument.getElementById('activities-tabbrowser-' +
                                                    this._panelId);
  },
  
  get window() {
    return this._panel.ownerDocument.defaultView;
  },

  startActivity: function(aActivity, aResultCallback, aErrorCallback) {
    let tabData = {
      activity: aActivity,
      successCB: aResultCallback,
      errorCB: aErrorCallback
    }
    let tab = this.window.gBrowser.selectedTab;
    if (!tab.activity)
      tab.activity = {};
    tab.activity[this.action] = tabData;
    this.invalidated = true;
  },
  
  get tabData() {
    let tab = this.window.gBrowser.selectedTab;
    return tab.activity? tab.activity[this.action] : this.defaultData;
  },

  observe: function(document, aTopic, aData) {
    let tb = this.window.document.getElementById('activities-tabbrowser-' + this._panelId);
    if (!tb || aTopic != 'document-element-inserted' ||
        !tb.getBrowserForDocument(document)) return;
    let i = tb.getBrowserIndexForDocument(document);
    let tab = tb.tabs[i];
    if (document.location == PREFS_URL) {
      this.hookupPrefs(document);
      tb.setIcon(tab, PREFS_ICON);
      document.defaultView.addEventListener("message",
                                            this.onPrefsMessage.bind(this),
                                            true);
      return;
    }
    if (!tab.service) {
      return
    }
    document.defaultView.addEventListener('load', function(e) {
      document.defaultView.removeEventListener('load', arguments.callee, false);
      document.defaultView.addEventListener("message",
                                            this.onMessage.bind(this),
                                            true);
    }.bind(this), true);
  },
  
  hookupPrefs: function(document) {
    function cb(serviceList) {
      // present an ordered selection based on frecency
      serviceList.sort(function(a,b) a.frecency-b.frecency).reverse();
      try {
        var win = document.defaultView;
        //console.log("postMessage to " + win.location.protocol + "//" + win.location.host);
        let data = JSON.stringify({
          topic: "handlers",
          data: serviceList
        });
        win.postMessage(data, "*");
      }
      catch(e) {
        Cu.reportError(e);
      }
    }
    activityRegistry.getActivityHandlers(this.action, cb);
  },
  
  onPrefsMessage: function(event) {
    let msg = JSON.parse(event.data);
    if (msg.topic !== "preference-change")
      return;
    let data = msg.data;
    function cb(serviceList) {
      serviceList.forEach(function(svc) {
        if (svc.url == data.url) {
          svc.enabled = data.enabled;
          activityRegistry.registerActivityHandler(svc.action, svc.url, svc);
          return;
        }
      });
    }
    activityRegistry.getActivityHandlers(data.action, cb);
  },
  
  onMessage: function(event) {
    //console.log("listener received " + event.data + " from "+ event.origin);
    // get the tab for the document on the event
    let msg = JSON.parse(event.data);
    if (msg.topic != 'activity' || !msg.data)
      return;
    // TODO: BUG 731797 find the tab for the activity, this is currently assuming the
    // panel is still visible so we're getting a postmessage back for the
    // currentTab, but there is potential that the user has switched tabs in the
    // meantime, or that a bad actor is haunting us.
    try {
      if (msg.data.success) {
        this.onActivitySuccess(msg);
      }
      else {
        this.onActivityFailure(msg);
      }
    }
    catch(e) {
      Cu.reportError(e);
    }
  },

  /**
   * what the panel gets attached to
   * */
  get anchor() {
    return this.window.document.getElementById(this.action + '-activity-button') ||
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
      this.tabData.successCB.handle(msg);
  },

  onActivityFailure: function(errob) {
    this.panel.hidePopup();
    this.showErrorNotification(errob);
    if (this.tabData.errorCB)
      this.tabData.errorCB.handle(errob);
  },
  
  _processTemplate: function(tmpl, activity) {
    let url = tmpl.replace("%{data}", activity.data);
    for (var d in activity.extras) {
      let repl = "%{" + d + "}";
      url = url.replace(repl, encodeURIComponent(activity.extras[d]));
    }
    return url;
  },

  onPanelShown: function() {
    // nothing to do here yet, but sub-classes might want to override this.
    let tb = this.window.document.getElementById('activities-tabbrowser-' +
                                                 this._panelId);
    let tab = tb.selectedTab;
    if (!tab.service)
      return;

    if (tab.service.urlTemplate) {
      // our builtins are most likely urlTemplate based share pages, we'll keep
      // it simple and use those for now, with the "upgrade" path being a full
      // activities implementation.
      let url = this._processTemplate(tab.service.urlTemplate,
                                      this.tabData.activity);
      if (url != tb.contentWindow.location.href)
        tb.contentWindow.location = url;
    }
    else {
      try {
        var win = tb.contentWindow;
        let location = win.location.protocol=='file:' ? "*" :
                       win.location.protocol + "//" + win.location.host;
        let data = JSON.stringify({
          topic: "activity",
          activity: this.tabData.activity
        });
        //console.log("   data is " + data);
        win.postMessage(data, location);
      }
      catch(e) {
        Cu.reportError(e);
      }
    }
  },

  onPanelHidden: function() {
  },

  /* end message api */
  
  
  _createPanelOverlay: function(aWindow) {
    // we create a new panel for each mediator method to ensure
    // they are unique per method.  This could be moved to a panel
    // xbl widget, but not really necessary
    let document = aWindow.document;
    let panel = this._panel = document.createElementNS(NS_XUL, 'panel');
    panel.setAttribute('id', 'activities-panel-' + this._panelId);
    panel.setAttribute('class', 'activities-panel');
    //panel.setAttribute("noautohide", "true");
    panel.setAttribute("type", "arrow");
    
    let box = document.createElementNS(NS_XUL, 'hbox');
  
    let tabs = document.createElementNS(NS_XUL, 'tabs');
    tabs.setAttribute('id', 'activities-tabs-' + this._panelId);
    tabs.setAttribute('tabbrowser', 'activities-tabbrowser-' + this._panelId);
    tabs.setAttribute('closebuttons', 'hidden');
    tabs.setAttribute('tabsontop', 'false');
    tabs.setAttribute('class', 'tabbrowser-tabs activities-tabs');
    tabs.orient = "vertical";
  
    let tab = document.createElementNS(NS_XUL, 'tab');
    tab.setAttribute('class', 'tabbrowser-tab');
    tab.setAttribute('selected', 'true');
    tab.setAttribute('fadein', 'true');
    tabs.appendChild(tab);
  
    // TODO: BUG 731797 will need to replace tabbrowser use with some custom
    // tabbrowser implementation.  tabbrowser expects it is the only
    // tabbrowser in a xul window, we get all kinds of sideaffects here.
    let tb = document.createElementNS(NS_XUL, 'tabbrowser');
    tb.setAttribute('id', 'activities-tabbrowser-' + this._panelId);
    tb.setAttribute('type', 'content');
    tb.setAttribute('class', 'activities-tabbrowser');
    tb.setAttribute('flex', '1');
    tb.setAttribute('tabcontainer', 'activities-tabs-' + this._panelId);
    box.appendChild(tabs);
    box.appendChild(tb);
    panel.appendChild(box);
  
    document.getElementById("mainPopupSet").appendChild(panel);
  
    tb.style.width = "660px";
    tb.style.height = "400px";
    tabs.mTabstrip.orient = "vertical";
    tabs.mCloseButtons = false;
    panel.mediator = this;
  },

  _createPopupPanel: function(aWindow) {
    this._createPanelOverlay(aWindow);
    let tb = this.tabbrowser;
    let empty = tb.selectedTab;
    // load prefs panel
    this._updatePanelServices();
    let tab = tb.addTab(PREFS_URL);
    tb.pinTab(tab);
    tb.selectTabAtIndex(0);
    tb.removeTab(empty);
    this.panel.addEventListener('popupshown', this.onPanelShown.bind(this));
    this.panel.addEventListener('popuphidden', this.onPanelHidden.bind(this));
    // use onPanelShown to resend activity
    this.panel.addEventListener('TabSelect', this.onPanelShown.bind(this)); 
  },
  
  _tabForService: function(svc) {
    let tabs = this.tabbrowser.tabs;
    for (var i=0; i < tabs.length; i++) {
      if (tabs[i].service && svc.url == tabs[i].service.url) return tabs[i];
    }
    return null;
  },

  _updatePanelServices: function() {
    let tb = this.tabbrowser;
    let self = this;
    function cb(serviceList) {
      // get the last tab
      let prefTab = tb.tabs[tb.tabs.length-1];
      // present an ordered selection based on frecency
      serviceList.sort(function(a,b) a.frecency-b.frecency).reverse();
      serviceList.forEach(function(svc) {
        // do we have a tab for this service?
        let tab = self._tabForService(svc);
        if (tab) {
          if (!svc.enabled) tb.removeTab(tab);
          return;
        }
        if (!svc.enabled)
          return;
        tab = tb.addTab(svc.url);
        tb.pinTab(tab);
        tab.service = svc;
      });
      tb.moveTabTo(prefTab, tb.tabs.length-1);
    }
    activityRegistry.getActivityHandlers(this.action, cb);
  },

  /**
   * show
   *
   * show the mediator popup
   */
  show: function() {
    if (this.invalidated) {
      this.tabData.activity = this.updateargs(this.tabData.activity);
      this.invalidated = false;
    }
    this.hideErrorNotification();
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
      // TODO: BUG 732274 need to strip message to text only
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
    try {
      this._updatePanelServices();
      let document = this.tabbrowser
                         .browsers[this.tabbrowser.browsers.length-1]
                         .contentDocument;
      this.hookupPrefs(document);
    }
    catch(e) {
      Cu.reportError(e);
    }
  }
}
