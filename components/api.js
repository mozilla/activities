/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Contributor(s):
 *	Shane Caraveo <scaraveo@mozilla.com>
 */

const {classes: Cc, interfaces: Ci, utils: Cu, resources: Cr, manager: Cm} = Components;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

//----- navigator.mozActivities api implementation
function NavigatorAPI() {};
NavigatorAPI.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.mozIDOMActivities, Ci.nsIDOMGlobalPropertyInitializer]),
  init: function API_init(aWindow) {
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
      properties[fn] = genPropDesc(fn);
    }
  
    Object.defineProperties(contentObj, properties);
    Cu.makeObjectPropsNormal(contentObj);
  
    return contentObj;
  }
};

function MozActivitiesAPI() {}
MozActivitiesAPI.prototype = {
  __proto__: NavigatorAPI.prototype,
  classID: Components.ID("{9175e12d-2377-5649-815b-2f49983d0ff3}"),
  contractID: "@mozilla.org/activities;1",
  _getObject: function(aWindow) {
    var xulWindow = aWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                   .getInterface(Ci.nsIWebNavigation)
                   .QueryInterface(Ci.nsIDocShellTreeItem)
                   .rootTreeItem
                   .QueryInterface(Ci.nsIInterfaceRequestor)
                   .getInterface(Ci.nsIDOMWindow); 
    return {
      startActivity: function(activity, successCB, errorCB) {
        // TODO BUG 731833 this should have the same protection as window.open,
        // only allowed on a user initiated event.
        let activityRegistry = Cc["@mozilla.org/activitiesRegistry;1"]
                                .getService(Ci.mozIActivitiesRegistry);
        return activityRegistry.invoke(xulWindow, activity, successCB, errorCB);
      },
      __exposedProps__: {
        startActivity: "r"
      }
    };
  }
}

var components = [MozActivitiesAPI];
var NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
