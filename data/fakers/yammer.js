
self.port.on("activity", function(activity) {
  if (unsafeWindow.location.search) {
    let vals = unsafeWindow.location.search.substr(1).split("&");
    for (let i=0; i < vals.length; i++) {
      if (vals[i].indexOf("status=") == 0) {
        // why are they double encoding?
        let href = decodeURIComponent(decodeURIComponent(vals[i].substr(7)));
        if (href == activity.data) return;
      }
    }
  }
  unsafeWindow.location = "https://www.yammer.com/home/bookmarklet?u="+activity.data;
});

