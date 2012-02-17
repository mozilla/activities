
const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
const EXPORTED_SYMBOLS = ["console"];

let console = {
  log: function(s) {
    dump(s+"\n");
  }
}