//console.log("enable action button support on"+unsafeWindow.location);

try {
$('button[type="action"]').click(function(e) {
  let data = {
    action: $(this).attr('data-action'),
    type: $(this).attr('data-type'),
    data: {
      data: $(this).attr('data-url'),
      title: $(this).attr('title'),
      contentType:"url"
      }
  };
  //console.log("button clicked "+JSON.stringify(data));
  unsafeWindow.navigator.wrappedJSObject.mozActivities.startActivity(
    data,
    function onResult(result) {
      console.log("result: "+JSON.stringify(result));
    }, 
    function onError(err) {
      console.log("onError: "+JSON.stringify(err));
    }
  );
});

} catch(e) {
  console.log(e);
}