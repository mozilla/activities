/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Contributor(s):
 *	Shane Caraveo <scaraveo@mozilla.com>
 */

const {classes: Cc, interfaces: Ci, utils: Cu, resources: Cr} = Components;

Cu.import("resource://gre/modules/PlacesUtils.jsm");

const EXPORTED_SYMBOLS = ["hasLogin", "builtinActivities", "frecencyForUrl"];

function hasLogin(hostname) {
  try {
    var loginManager = Cc["@mozilla.org/login-manager;1"]
                          .getService(Ci.nsILoginManager);
    return loginManager.countLogins(hostname, "", "") > 0; 
  } catch(e) {
    Cu.reportError(e);
  }
  return false;
}

function reverse(s){
    return s.split("").reverse().join("");
}

function frecencyForUrl(host)
{
  // BUG 732275 there has got to be a better way to do this!
  let dbconn = PlacesUtils.history.QueryInterface(Ci.nsPIPlacesDatabase)
                                  .DBConnection;
  let frecency = 0;
  let stmt = dbconn.createStatement(
    "SELECT frecency FROM moz_places WHERE rev_host = ?1"
  );
  try {
    stmt.bindByIndex(0, reverse(host) + '.');
    if (stmt.executeStep())
      frecency = stmt.getInt32(0);
  } finally {
    stmt.finalize();
  }

  return frecency;
}


// this is an ordered list, "least popular" to "most popular" which will
// be maintained in the case the user does not have any logins or frecency.
// the mediator will enable via login and frecency, and sort by frecency.
var builtinActivities = [
  {
    name: "Yammer",
    login: "https://www.yammer.com",
    action: "share",
    url: "https://www.yammer.com/home/bookmarklet",
    urlTemplate: "https://www.yammer.com/home/bookmarklet?u=%{data}",
    icon: "https://www.yammer.com/favicon.ico",
  },
  {
    name: "Digg",
    login: "http://digg.com",
    action: "share",
    url: "http://digg.com/submit", 
    urlTemplate: "http://digg.com/submit?url=%{data}",
    icon: "http://digg.com/favicon.ico"
  },
  {
    name: "Google+",
    login: "https://www.google.com",
    action: "share",
    url: "https://plus.google.com/share?url=about:blank",
    urlTemplate: "https://plus.google.com/share?url=%{data}",
    icon: "https://plus.google.com/favicon.ico"
  },
  {
    name: "GMail",
    login: "https://www.google.com",
    action: "share",
    url: "https://mail.google.com/mail/?view=cm&ui=2&tf=0&fs=1",
    urlTemplate: "https://mail.google.com/mail/?view=cm&ui=2&tf=0&fs=1&body=%{data}&su=%{title}",
    icon: "https://mail.google.com/favicon.ico"
  },
  {
    name: "Twitter",
    login: "https://twitter.com",
    action: "share",
    url: "https://twitter.com/intent/tweet",
    urlTemplate: "https://twitter.com/intent/tweet?url=%{data}",
    icon: "https://twitter.com/phoenix/favicon.ico"
  },
  {
    name: "Facebook",
    login: "https://www.facebook.com",
    action: "share",
    url: "https://www.facebook.com/sharer/sharer.php",
    urlTemplate: "https://www.facebook.com/sharer/sharer.php?u=%{data}",
    icon: "https://www.facebook.com/favicon.ico"
  }
];
