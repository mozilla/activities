
self.port.on("activity", function(activity) {
  unsafeWindow.location = "https://www.facebook.com/sharer/sharer.php?u="+activity.data;
});