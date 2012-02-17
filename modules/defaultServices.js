const {classes: Cc, interfaces: Ci, utils: Cu, resources: Cr} = Components;

Cu.import("resource://gre/modules/PlacesUtils.jsm");

const EXPORTED_SYMBOLS = ["hasLogin", "registerDefaultWebActivities", "frecencyForUrl"];

function hasLogin(hostname) {
  try {
    var loginManager = Cc["@mozilla.org/login-manager;1"].getService(Ci.nsILoginManager);
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


// this is an ordered list, "least popular" to "most popular" which will
// be maintained in the case the user does not have any logins or frecency.
// the mediator will enable via login and frecency, and sort by frecency.
var builtin = [
  {
    login: "https://www.yammer.com",
    action: "share",
    url: "https://www.yammer.com/home/bookmarklet",
    urlTemplate: "https://www.yammer.com/home/bookmarklet?u=%{data}",
  },
  {
    login: "http://digg.com",
    action: "share",
    url: "http://digg.com/submit", 
    urlTemplate: "http://digg.com/submit?url=%{data}",
  },
  {
    login: "https://www.google.com",
    action: "share",
    url: "https://plusone.google.com/_/+1/confirm",
    urlTemplate: "https://plusone.google.com/_/+1/confirm?hl=en&url=%{data}",
  },
  {
    login: "https://www.google.com",
    action: "share",
    url: "https://mail.google.com/mail/?view=cm&ui=2&tf=0&fs=1",
    urlTemplate: "https://mail.google.com/mail/?view=cm&ui=2&tf=0&fs=1&body=%{data}&su=%{title}",
  },
  {
    login: "https://twitter.com",
    action: "share",
    url: "https://twitter.com/intent/tweet",
    urlTemplate: "https://twitter.com/intent/tweet?url=%{data}",
  },
  {
    login: "https://www.facebook.com",
    action: "share",
    url: "https://www.facebook.com/sharer/sharer.php",
    urlTemplate: "https://www.facebook.com/sharer/sharer.php?u=%{data}",
  },
  {
    login: "resource://activities",
    action: "share",
    url: "resource://activities/test/tester.html"
  }
];

function registerDefaultWebActivities() {
  // load this late to avoid cyclic loading
  let tmp = {};
  Cu.import("resource://activities/modules/services.js", tmp);
  let {activityRegistry} = tmp;
  builtin.forEach(function(activity) {
    activityRegistry.registerActivityHandler(activity.action, activity.url, activity);
  });
}

