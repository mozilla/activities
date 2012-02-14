
unsafeWindow.console = console;
unsafeWindow.addEventListener("message", function(event) {
  console.log("tester.js got message:")
  console.log(JSON.stringify(event.data) + " from "+(event.source?event.source.location:"addon"));
}, true);
unsafeWindow.addEventListener("load", function() {
  console.log("try to send message from tester.js");
  try {
    unsafeWindow.postMessage(JSON.stringify({test:"injected tester.js"}), "*");
  } catch(e) {
    console.log(e);
  }
}, true);

