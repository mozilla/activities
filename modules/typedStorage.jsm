/* -*- Mode: JavaScript; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Contributor(s):
 *    Ian Bicking <ibicking@mozilla.com>
 *    Dan Walkowski <dwalkowski@mozilla.com>
 *    Anant Narayanan <anant@kix.in>
 *    Shane Caraveo <scaraveo@mozilla.com>
 */

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

var console = {
  log: function(s) {
    dump(s + "\n");
  }
};

function TypedStorageImpl() {}
TypedStorageImpl.prototype = {
  open: function(objType, dbName) {
    return new ObjectStore(objType, dbName);
  }
};

function ObjectStore(objType, dbName) {
  let file = Cc["@mozilla.org/file/directory_service;1"].
              getService(Ci.nsIProperties).
              get("ProfD", Ci.nsIFile);
              file.append(dbName + ".sqlite");
  let storageService = Cc["@mozilla.org/storage/service;1"].
              getService(Ci.mozIStorageService);

  // Will also create the file if it does not exist
  let dbConn = storageService.openDatabase(file);
  this._dbConn = dbConn;

  // See if the table is already created:
  let statement;
  let tableExists = false;
  try {
    statement = dbConn.createStatement("SELECT * FROM " + objType + " LIMIT 1");
    statement.executeStep();
    tableExists = true;
  } catch (e) {} finally {
    if (statement) statement.finalize();
  }

  if (!tableExists) {
    try {
      dbConn.executeSimpleSQL("CREATE TABLE " + objType + " (action TEXT NOT NULL, origin TEXT NOT NULL, manifest TEXT, PRIMARY KEY(action, origin))");
    } catch (e) {
      console.log("Error while creating table: " + e);
      throw e;
    }
  }

  this._objType = objType;
}
ObjectStore.prototype = {
  get: function(action, origin, cb) {
    let self = this;
    let value;
    let getStatement = this._dbConn.createStatement("SELECT manifest FROM " + this._objType + " WHERE action = :action AND origin = :origin LIMIT 1");
    getStatement.params.action = action;
    getStatement.params.origin = origin;
    getStatement.executeAsync({
      handleResult: function(result) {
        let row = result.getNextRow();
        if (row) {
          value = JSON.parse(row.getResultByName("manifest"));
        }
      },
      handleError: function(error) {
        console.log("Error while selecting from table " + self._objType + ": " + error + "; " + self._dbConn.lastErrorString + " (" + this._dbConn.lastError + ")");
      },
      handleCompletion: function(reason) {
        getStatement.reset();
        if (reason != Ci.mozIStorageStatementCallback.REASON_FINISHED) console.log("Get query canceled or aborted! " + reason);
        else {
          try {
            cb(value);
          } catch (e) {
            console.log("Error in completion callback for ObjectStore.get(): " + e);
            console.log(e.stack);
          }
        }
      }
    });
  },

  insert: function(action, origin, manifest, cb) {
    let setStatement = this._dbConn.createStatement("INSERT INTO " + this._objType + " (action, origin, manifest) VALUES (:action, :origin, :manifest)");
    setStatement.params.action = action;
    setStatement.params.origin = origin;
    setStatement.params.manifest = JSON.stringify(manifest);
    this._doAsyncExecute(setStatement, cb);
  },

  put: function(action, origin, manifest, cb) {
    let setStatement = this._dbConn.createStatement("INSERT OR REPLACE INTO " + this._objType + " (action, origin, manifest) VALUES (:action, :origin, :manifest)");
    setStatement.params.action = action;
    setStatement.params.origin = origin;
    setStatement.params.manifest = JSON.stringify(manifest);
    this._doAsyncExecute(setStatement, cb);
  },

  remove: function(action, origin, cb) {
    let removeStatement = this._dbConn.createStatement("DELETE FROM " + this._objType + " WHERE action = :action AND origin = :origin");
    removeStatement.params.action = action;
    removeStatement.params.origin = origin;
    this._doAsyncExecute(removeStatement, cb);
  },

  clear: function(cb) {
    let clearStatement = this._dbConn.createStatement("DELETE FROM " + this._objType);
    this._doAsyncExecute(clearStatement, cb);
  },

  has: function(key, cb) {
    this.get(key, function(data) {
      cb(data !== null);
    })
  },

  keys: function(cb) {
    let resultKeys = [];
    let keyStatement = this._dbConn.createStatement("SELECT action, origin FROM " + this._objType);

    let self = this;
    keyStatement.executeAsync({
      handleResult: function(result) {
        let row;
        while ((row = result.getNextRow())) {
          resultKeys.push([row.getResultByName("action"), row.getResultByName("origin")]);
        }
      },
      handleError: function(error) {
        console.log("Error while getting keys for " + self._objType + ": " + error + "; " + self._dbConn.lastErrorString + " (" + self._dbConn.lastError + ")");
      },
      handleCompletion: function(reason) {
        keyStatement.reset();
        if (reason != Ci.mozIStorageStatementCallback.REASON_FINISHED) console.log("Keys query canceled or aborted! " + reason);
        else {
          try {
            cb(resultKeys);
          } catch (e) {
            console.log("Error in completion callback for ObjectStore.keys(): " + e);
          }
        }
      }
    });
  },

  iterate: function(cb) {
    // sometimes asynchronous calls can make your head hurt
    let store = this;
    this.keys(function(allKeys) {
      for (let i = 0; i < allKeys.length; i++) {
        store.get(allKeys[i][0], allKeys[i][1], function(values) {
          let result = cb(allKeys[i], values);
          if (result === false) return;
        });
      }
    });
  },

  // Helper function for async execute with no results
  _doAsyncExecute: function(statement, cb) {
    let self = this;
    statement.executeAsync({
      handleResult: function(result) {},
      handleError: function(error) {
        console.log("Error while executing " + statement + "on" + self._objType + ": " + error + "; " + self._dbConn.lastErrorString + " (" + self._dbConn.lastError + ")");
      },
      handleCompletion: function(reason) {
        statement.reset();
        if (reason != Ci.mozIStorageStatementCallback.REASON_FINISHED) console.log("Query canceled or aborted! " + reason);
        else {
          try {
            if (cb) cb(true);
          } catch (e) {
            console.log("Error while invoking callback for " + statement + ": " + e);
            console.log(e.stack);
          }
        }
      }
    });
  }
};

// We create a Singleton
var TypedStorageImplSingleton = new TypedStorageImpl();

function TypedStorage() {
  return TypedStorageImplSingleton;
}
var EXPORTED_SYMBOLS = ["TypedStorage"];

