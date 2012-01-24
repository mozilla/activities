
var activities = {};
var origin = null;
var callid = 0;

unsafeWindow.navigator.wrappedJSObject.mozActivities.services = {
  // notify our mediator that we're ready for business.
  ready: function() {
    self.port.emit("owa.service.ready", origin);
  },
  // the service is registering a handler.  we track it here and then let the mediator know
  // we're listing for shit
  registerHandler: function(action, message, func) {
    var activity = {
      origin: origin,
      action: action,
      message: message
    }
    activities[action+"/"+message] = {
      activity: activity,
      message: message,
      callback: func
    }
    self.port.emit("owa.service.register.handler", activity);
  }
}

self.port.on("owa.service.origin", function(frameOrigin) {
  origin = frameOrigin;
});

// someone called invokeService, we handle it here
self.port.on("owa.service.invoke", function(args) {
  var activity = args.activity;
  var credentials = args.credentials;
  activity.postResult = function postResult(result) {
    self.port.emit(activity.success, result);
  }
  var postException = activity.postException = function postException(exc) {
    self.port.emit(activity.error, exc);
  }
  try {
    activities[activity.action+"/"+activity.message].callback(activity, credentials);
  } catch (ex) {
    postException({code: 'runtime_error', message: ex.toString()});
  }
});

