const {Cc,Ci,Cu} = require("chrome");
const addon = require("self");

var tmp = {};
Cu.import("resource://gre/modules/PlacesUtils.jsm", tmp);
var { PlacesUtils } = tmp;
var loginManager = Cc["@mozilla.org/login-manager;1"].getService(Ci.nsILoginManager);


function hasLogin(host) {
  try {
    var loginManager = Cc["@mozilla.org/login-manager;1"].getService(Ci.nsILoginManager);
    return loginManager.countLogins(hostname, "", "") > 0; 
  } catch(e) {
    console.log(e);
  }
  return false;
}

function reverse(s){
    return s.split("").reverse().join("");
}

function frecencyForUrl(host)
{
  // XXX there has got to be a better way to do this!
  let dbconn = PlacesUtils.history.QueryInterface(Ci.nsPIPlacesDatabase)
                                  .DBConnection;
  let frecency = 0;
  let stmt = dbconn.createStatement(
    "SELECT frecency FROM moz_places WHERE rev_host = ?1"
  );
  try {
    stmt.bindByIndex(0, reverse(host)+'.');
    if (stmt.executeStep())
      frecency = stmt.getInt32(0);
  } finally {
    stmt.finalize();
  }

  return frecency;
}

function shouldRegister(host) {
  
}

function shouldAskRegister(host) {
  
}

exports.registerDefaultServices = function() {

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
  
  activityRegistry.registerActivityHandler("share", "https://www.yammer.com/home/bookmarklet", {
    contentScriptFile: addon.data.url("fakers/yammer.js"),
    name: "Yammer"
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

