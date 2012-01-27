
self.port.on("activity", function(activity) {
  let loc = "http://digg.com/submit?url="+activity.data;
  if (loc != unsafeWindow.location) {
    console.log("updating location "+window.location)
    unsafeWindow.location = loc;
  }
});