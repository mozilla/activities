
self.port.on("activity", function(activity) {
  let loc = "https://mail.google.com/mail/?view=cm&ui=2&tf=0&fs=1&body="+activity.data+"&su="+activity.title;
  if (loc != unsafeWindow.location) {
    console.log("updating location "+window.location)
    unsafeWindow.location = loc;
  }
});