
self.port.on("activity", function(activity) {
  console.log(JSON.stringify(activity));
  unsafeWindow.location = "http://digg.com/submit?url="+activity.data;
});