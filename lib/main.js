const { Cc, Ci, Cm, Cu, Cr, components } = require("chrome");
var tmp = {};
Cu.import("resource://gre/modules/Services.jsm", tmp);
Cu.import("resource://gre/modules/AddonManager.jsm", tmp);
Cu.import("resource://gre/modules/XPCOMUtils.jsm", tmp);
var { XPCOMUtils, AddonManager, Services } = tmp;

const addon = require("self");
const pageMod = require("page-mod");


let unloaders = [];
let { installOverlay } = require("overlay");

//----- inject code to handle action button markup
let actionButtonMod = pageMod.PageMod({
  include: ["*", "file:*"],
  contentScriptWhen: 'ready',
  contentScriptFile: [require("self").data.url("jquery-1.4.4.min.js"),
                      addon.data.url("actionButton.js")]
});
//-----

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

exports.main = function(options, callbacks) {
  console.log("web activities addon starting")

  /* We use winWatcher to create an instance per window (current and future) */
  let iter = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator).getEnumerator("navigator:browser");
  while (iter.hasMoreElements()) {
    let aWindow = iter.getNext().QueryInterface(Ci.nsIDOMWindow);
    unloaders.push.apply(unloaders, installOverlay(aWindow));
    let serviceInvocationHandler = require("services").serviceInvocationHandler;
    aWindow.serviceInvocationHandler = new serviceInvocationHandler(aWindow);
  }

  function winWatcher(subject, topic) {
    if (topic != "domwindowopened") return;
    unloaders.push.apply(unloaders, installOverlay(subject));
    let serviceInvocationHandler = require("services").serviceInvocationHandler;
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
  
// a bunch of test registrations
let { activityRegistry } = require("activities/services");

activityRegistry.registerActivityHandler("share", "https://twitter.com/intent/tweet", {
  contentScriptFile: addon.data.url("fakers/twitter.js"),
  name: "Twitter"
});
activityRegistry.registerActivityHandler("share", "https://www.facebook.com/sharer/sharer.php", {
  contentScriptFile: addon.data.url("fakers/facebook.js"),
  name: "Facebook"
});

//"https://plus.google.com/app/plus/x/?v=compose" for a non +1 stream post
activityRegistry.registerActivityHandler("share", "https://plusone.google.com/_/+1/confirm", {
  contentScriptFile: addon.data.url("fakers/plus.js"),
  name: "Google+"
});

activityRegistry.registerActivityHandler("share", "http://digg.com/submit", {
  contentScriptFile: addon.data.url("fakers/digg.js"),
  name: "Digg"
});
activityRegistry.registerActivityHandler("share", "https://mail.google.com/mail/?view=cm&ui=2&tf=0&fs=1", {
  contentScriptFile: addon.data.url("fakers/gmail.js"),
  name: "Gmail"
});

}

exports.onUnload = function(reason) {
  // variable why is one of 'uninstall', 'disable', 'shutdown', 'upgrade' or
  // 'downgrade'. doesn't matter now, but might later
  unloaders.forEach(function(unload) unload && unload());
}


