var static = require('node-static'),
  http = require('http'),
  url = require('url'),
  async = require('async'),
  couchbase = require("couchbase");

var assets = new(static.Server)('assets');

// http://stackoverflow.com/questions/11246758/how-to-get-unique-values-in-a-array
Array.prototype.contains = function(v) {
    for(var i = 0; i < this.length; i++) {
        if(this[i] === v) return true;
    }
    return false;
};

Array.prototype.unique = function() {
    var arr = [];
    for(var i = 0; i < this.length; i++) {
        if(!arr.contains(this[i])) {
            arr.push(this[i]);
        }
    }
    return arr;
}

var designDocName = "twitterfight";

function setupViews(bucket, cb) {
  // return cb();
  // TODO actually run this code.
  var views = {
    tokens: {
      map : function (doc, meta) {
        if (meta.type == "json" && meta.id[0] == "t") {
          emit(doc, null);
        }
      }.toString()
    },
    activePlayers : {
      map : function (doc, meta) {
        if (doc.name && doc.date)
          emit(doc.date, doc.name);
      }.toString()
    },
    userWords: {
      map : function (doc, meta) {
        if (meta.type == "json" && meta.id[0] == "u") {
          if (typeof doc == "number") {
            var us = meta.id.split(":");
            emit([us[1], doc], decodeURIComponent(us[2]));
          }
        }
      }.toString()
    },
    users: {
      map : function (doc, meta) {
        if (meta.type == "json" && meta.id[0] == "u") {
          if (typeof doc == "number") {
            var us = meta.id.split(":");
            emit(us[1], doc);
          }
        }
      }.toString(),
      reduce : "_sum"
    }
  }
  console.log("setup views")
  // bucket.deleteDesignDoc(designDocName, function() {
    bucket.setDesignDoc(designDocName, {views:views}, cb)
  // })
}

couchbase.connect({}, function(err, bucket) {
  if (err) {
      // For some reason we failed to make a connection to the
      // Couchbase cluster.
      throw err;
  }

  setupViews(bucket, function(err){
    if (err) {
        // couldn't set up the views we need
        throw err;
    }
    // we are setup, open for
    http.createServer(function (req, res) {
      var requrl = url.parse(req.url)
      console.log(req.method, requrl.path)
      if (requrl.path == "/input") {
        acceptTweet(req, res);
      } else if (requrl.path == "/user") {
        acceptUser(req, res);
      } else if (requrl.path == "/setup") {
        renderLeaderboard(function(userInfos) {
          res.writeHead(200);
          res.end(JSON.stringify(userInfos));
        })
      } else {
        assets.serve(req, res);
      }
    }).listen(8080);
    console.log("connect at http://localhost:8080");
  });

  function readJSONBody(req, cb) {
    if (req.method == 'POST') {
      var body = '';
      req.on('data', function (data) {
          body += data;
      });
      req.on('end', function () {
        try {
          var json = JSON.parse(body);
          cb(false, json)
        } catch (e) {
          cb(e)
        }
      });
    }
  }

  function processTweet(tweet, cb) {
    if (tweet.text) {
      var keys = [], tokens = tweet.text.split(/\W/).unique();

      // console.log("tokens", tokens);
      for (var i = tokens.length - 1; i >= 0; i--) {
        var t = tokens[i];
        if (!t || t.length < 6) continue;
        keys.push("t:"+encodeURIComponent(t))
        keys.push("u:"+encodeURIComponent(tweet.fight.user)+":"+encodeURIComponent(t))
      };
      async.map(keys, function(key, cb1) {
        if (key) {
          // console.log("incr "+key);
          bucket.incr(key, cb1)
        }
      }, cb)
    }
  }

  function acceptTweet(req, res) {
    // read request body, parse as JSON
    readJSONBody(req, function(err, json) {
      if (err) {
        res.writeHead(400)
        res.end(JSON.stringify({error : "invalid_json", reason: err}))
      } else {
        processTweet(json, function(err, ok){
          console.log("processed tweet", err)
          res.writeHead(200)
          res.end('{"ok":true}')
        })
      }
    })
  }

  // user stuff

  function acceptUser(req, res) {
    console.log("acceptUser")
    readJSONBody(req, function(err, json) {
      console.log("user json", err, json)

      if (err) {
        res.writeHead(400)
        res.end(JSON.stringify({error : "invalid_json", reason: err}))
      } else {
        bucket.set("user:"+json.name, json, function(err, ok){
          console.log("saved user", err, ok)
          res.writeHead(200)
          res.end('{"ok":true}')
        })
      }
    })
  }

  // leaderboard stuff

  function renderLeaderboard (finalCallback) {
    bucket.get("cached-leaderboard", function(err, cached) {
      // console.log("cached-leaderboard", err, cached)
      if (cached && cached.users) {
        finalCallback(cached.users);
      } else {
        var userInfos = [];
        getActiveUsers(function(err, users) {
          if (err) {console.log("getActiveUsers err", err); throw(err)}
          console.log("these users", users)
          async.forEach(users, function(u, cb) {
              bucket.view(designDocName, "userWords", {
                limit:20, descending:true, reduce:false,
                endkey : [u], startkey : [u,{}]
              }, function(err, rows) {
                var words = rows.map(function(row) {
                  return [Math.log(row.key[1])*10, row.value];
                });
                bucket.view(designDocName, "users", {
                  reduce:true,
                  key : u
                }, function(err, rows) {
                  console.log("users", err, rows)
                  if (rows && rows[0]) {
                    var total = rows[0].value;
                    var userInfo = {name : u, words : words, total: total};
                    // console.log("push user info", userInfo)
                    userInfos.push(userInfo);
                  }
                  cb()
                });
              });
          }, function() {
            // console.log("all users done", userInfos);
            userInfos = userInfos.sort(function(b,a) {return a.total - b.total});
            // console.log("new-leaderboard", {users:userInfos})
            bucket.set("cached-leaderboard",
              JSON.stringify({users:userInfos}), {expiry:2},
              function() {
                finalCallback(userInfos);
            });
          });
        });

      }
    })
  }

  function getActiveUsers (cb) {
    bucket.view(designDocName, "activePlayers", {limit:20, descending:true}, function(err, rows) {
      if (err) {
        cb(err)
      } else {
        var users = {};
        rows.forEach(function(r) {
          users[r.value] = true;
        })
        cb(false, Object.keys(users))
      }
    })
  }
}); // couchbase.connect


