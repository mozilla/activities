const {classes: Cc, interfaces: Ci, utils: Cu, resources: Cr, manager: Cm} = Components;
var tmp = {};
Cu.import("resource://gre/modules/Services.jsm", tmp);
Cu.import("resource://gre/modules/AddonManager.jsm", tmp);
Cu.import("resource://gre/modules/XPCOMUtils.jsm", tmp);
var { XPCOMUtils,
      AddonManager,
      Services } = tmp;

try {
Cu.import("resource://activities/lib/console.js");
Cu.import("resource://activities/lib/defaultServices.js");
Cu.import("resource://activities/lib/overlay.js");
Cu.import("resource://activities/lib/services.js");
Cu.import("resource://activities/lib/share-ui.js");
} catch(e) {
  dump(e);
}

const EXPORTED_SYMBOLS = ["startup", "shutdown"];


let unloaders = [];

//----- navigator.mozActivities api implementation
function NavigatorAPI() {};
NavigatorAPI.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIDOMGlobalPropertyInitializer]),
  init: function API_init(aWindow) {
    //console.log("API object init for "+aWindow.location);
    let chromeObject = this._getObject(aWindow);
  
    // We need to return an actual content object here, instead of a wrapped
    // chrome object. This allows things like console.log.bind() to work.
    let contentObj = Cu.createObjectIn(aWindow);
    function genPropDesc(fun) {
      return { enumerable: true, configurable: true, writable: true,
               value: chromeObject[fun].bind(chromeObject) };
    }
    let properties = {};
    
    for (var fn in chromeObject.__exposedProps__) {
      //console.log("adding property "+fn);
      properties[fn] = genPropDesc(fn);
    }
  
    Object.defineProperties(contentObj, properties);
    Cu.makeObjectPropsNormal(contentObj);
  
    return contentObj;
  }
};

MozActivitiesAPIContract = "@mozilla.org/openwebapps/mozActivities;1";
MozActivitiesAPIClassID = Components.ID("{9175e12d-2377-5649-815b-2f49983d0ff3}");
function MozActivitiesAPI() {}
MozActivitiesAPI.prototype = {
  __proto__: NavigatorAPI.prototype,
  classID: MozActivitiesAPIClassID,
  _getObject: function(aWindow) {
    return {
      startActivity: function(activity, successCB, errorCB) {
        let wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
        let recentWindow = wm.getMostRecentWindow("navigator:browser");
        recentWindow.serviceInvocationHandler.invoke(activity, successCB, errorCB);
      },
      __exposedProps__: {
        startActivity: "r"
      }
    };
  }
}
let MozActivitiesAPIFactory = {
  createInstance: function(outer, iid) {
    if (outer != null) throw Cr.NS_ERROR_NO_AGGREGATION;
    return new MozActivitiesAPI().QueryInterface(iid);
  }
};

//----- navigator.mozActivities api implementation
function eachWindow(callback) {
  let enumerator = Services.wm.getEnumerator("navigator:browser");
  while (enumerator.hasMoreElements()) {
    let win = enumerator.getNext();
    if (win.document.readyState === "complete") {
      callback(win);
    } else {
      runOnEvent("load", win, callback);
    }
  }
}

function runOnEvent(evt, window, callback) {
  window.addEventListener(evt, function onLoad() {
    window.removeEventListener(evt, onLoad, false);
    callback(window);
  }, false);
}

function startup(options, callbacks) {
  console.log("web activities addon starting")

  /* We use winWatcher to create an instance per window (current and future) */
  eachWindow(function(aWindow) {
    unloaders.push.apply(unloaders, installOverlay(aWindow));
    unloaders.push.apply(unloaders, installShareOverlay(aWindow)); // XXX Share specific
    aWindow.serviceInvocationHandler = new serviceInvocationHandler(aWindow);
  });

  function winWatcher(subject, topic) {
    if (topic != "domwindowopened") return;
    unloaders.push.apply(unloaders, installOverlay(subject));
    unloaders.push.apply(unloaders, installShareOverlay(subject)); // XXX Share specific
    subject.serviceInvocationHandler = new serviceInvocationHandler(subject);
  }
  Services.ww.registerNotification(winWatcher);
  unloaders.push(function() Services.ww.unregisterNotification(winWatcher));

  // register our navigator api's that will be globally attached
  // for now, check a pref to see if we've disabled the api.  fx-share-addon
  // will do this
  if (options.disabled)
    return;
  console.log("enabling the activities content api");

  Cm.QueryInterface(Ci.nsIComponentRegistrar).registerFactory(
    MozActivitiesAPIClassID, "MozActivitiesAPI", MozActivitiesAPIContract, MozActivitiesAPIFactory
  );
  Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager).
              addCategoryEntry("JavaScript-navigator-property", "mozActivities",
                      MozActivitiesAPIContract,
                      false, true);

  unloaders.push(function() {
    Cm.QueryInterface(Ci.nsIComponentRegistrar).unregisterFactory(
      MozActivitiesAPIClassID, MozActivitiesAPIFactory
    );
    Cc["@mozilla.org/categorymanager;1"].getService(Ci.nsICategoryManager).
                deleteCategoryEntry("JavaScript-navigator-property", "mozActivities", false);
  });
  
  registerDefaultServices();
}

function shutdown(reason) {
  // variable why is one of 'uninstall', 'disable', 'shutdown', 'upgrade' or
  // 'downgrade'. doesn't matter now, but might later
  unloaders.forEach(function(unload) unload && unload());
}


