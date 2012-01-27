
self.port.on("activity", function(activity) {
  unsafeWindow.location = "https://twitter.com/intent/tweet?url="+activity.data+"&via=Firefox";
});