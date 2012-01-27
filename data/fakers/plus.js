
self.port.on("activity", function(activity) {
  unsafeWindow.location = "https://plusone.google.com/_/+1/confirm?hl=en&url="+activity.data;
});