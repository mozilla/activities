
self.port.on("activity", function(activity) {
  let loc = "https://www.facebook.com/sharer/sharer.php?u="+activity.data;
  if (loc != unsafeWindow.location) {
    console.log("updating location "+window.location)
    unsafeWindow.location = loc;
  }
});