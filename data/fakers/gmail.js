
self.port.on("activity", function(activity) {
  console.log(JSON.stringify(activity));
  unsafeWindow.location = "https://mail.google.com/mail/?view=cm&ui=2&tf=0&fs=1&body="+activity.data+"&su="+activity.title;
});