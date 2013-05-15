var static = require('node-static'),
  http = require('http'),
  url = require('url'),
  async = require('async'),
  coux = require('coux'),
  setup = require('../lib/setup');


var couchViews = "http://ether.local:8092/default/_design/twitterfight/_view/",
  couchbaseHost = "http://ether.local:8091";

var file = new(static.Server)('assets');

setup.getPorts(couchbaseHost, "default", function(err, ports) {
  setup.withMC(ports.mc, "localhost", function(err, client, done) {

    function renderLeaderboard (finalCallback) {
      client.get("cached-leaderboard", function(err, cached) {
        if (cached) {
          finalCallback(JSON.parse(cached));
        } else {
          var userInfos = [];
          getActiveUsers(function(err, users) {
            async.forEach(users, function(u, cb) {
                coux([couchViews, "userWords", {
                  limit:20, descending:true, reduce:false,
                  endkey : [u], startkey : [u,{}]
                }], function(err, data) {
                  var words = data.rows.map(function(row) {
                    return [Math.log(row.key[1])*10, row.value];
                  });
                  coux([couchViews, "userWords", {
                    reduce:true,
                    startkey : [u], endkey : [u,{}]
                  }], function(err, data) {
                    if (data && data.rows && data.rows[0]) {
                      var total = data.rows[0].value;
                      var userInfo = {name : u, words : words, total: total};
                      userInfos.push(userInfo);
                    }
                    cb()
                  });
                });
            }, function() {
              userInfos = userInfos.sort(function(b,a) {return a.total - b.total});
              client.set("cached-leaderboard", JSON.stringify(userInfos),
                function() {
                  finalCallback(userInfos);
              }, 1);
            });
          });

        }
      })
    }

    function getActiveUsers (cb) {
      coux([couchViews, "activePlayers", {limit:20, descending:true}], function(err, data) {
        if (err) { cb(err) } else {
          var users = {};
          data.rows.forEach(function(r) {
            users[r.value] = true;
          })
          cb(false, Object.keys(users))
        }
      })
    }

    http.createServer(function (req, res) {
      var requrl = url.parse(req.url)
      console.log(requrl.path)

      if (requrl.path == "/setup") {
        renderLeaderboard(function(userInfos) {
          res.writeHead(200);
          res.end(JSON.stringify(userInfos));
        })
      } else {
        file.serve(req, res);
      }

    }).listen(8080);




  })
})


