
self.port.on("activity", function(activity) {
  let loc = "https://plusone.google.com/_/+1/confirm?hl=en&url="+activity.data;
  if (loc != unsafeWindow.location) {
    console.log("updating location "+window.location)
    unsafeWindow.location = loc;
  }
});