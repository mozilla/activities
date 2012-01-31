
self.port.on("activity", function(activity) {
  let loc = "https://twitter.com/intent/tweet?url="+activity.data+"&via=Firefox";
  if (loc != unsafeWindow.location) {
    unsafeWindow.location = loc;
  }
});


if (unsafeWindow.location.pathname == "/intent/tweet/complete") {
  let result = "https://twitter.com/"+$('.tweet-complete a.launch').attr('href');
  self.port.emit('activity.result', {
    data: result
  });
}
