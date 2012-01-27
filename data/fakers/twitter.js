
self.port.on("activity", function(activity) {
  let loc = "https://twitter.com/intent/tweet?url="+activity.data+"&via=Firefox";
  if (loc != unsafeWindow.location) {
    console.log("updating location "+window.location)
    unsafeWindow.location = loc;
  }
});