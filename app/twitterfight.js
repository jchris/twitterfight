var couchbaseHost = "http://mineral.local:8091",
  prompt = require('prompt'),
  fs = require('fs'),
  request = require('request'),
  async = require('async'),
  setup = require('../lib/setup');

function promptSetup (cb) {
  console.log("")
  prompt.start();
  prompt.get([{
    "name" : "username",
    "empty" : false,
    "message" : "What is your twitter username? (without the @)"
  }, {
    "name" : "password",
    "hidden" : true,
    "empty" : false,
    "message" : "Your twitter password (will not be stored or shared, sent to Twitter via HTTPS)"
  }, {
    "name" : "terms",
    "message" : "Pick your buzzwords! (comma seperated)",
    "empty" : false,
    'default' : "javascript,lxjs,nosql,couchbase"
  }], cb);
}

function tokenize (text) {
  return text.split(' ');
}

setup.getPorts(couchbaseHost, "default", function(err, ports) {
  setup.withMC(ports.mc, "mineral.local", function(err, client, done) {
    promptSetup(function(err, prompted) {
      console.log("\nconnecting to Twitter, searching for ", prompted.terms);
      var twitterURL = 'https://'+prompted.username+':'+prompted.password+'@stream.twitter.com/1.1/statuses/filter.json',
        post = request.post(twitterURL).form({track : prompted.terms});

      function registerUser() {
        client.set(Math.random().toString(), JSON.stringify({
          name : prompted.username,
          date : new Date()
        }), function() {});
      };

      var first = true;
      function onSearchData(json, cb) {
        cb = cb || function() {};

        if (first) {
          // register our user with the server
          first = false;
          registerUser();
        }

        try {
          var data = JSON.parse(json);
        } catch (err) {
          // console.error("error processing data", err, json.toString())
        }

        if (data && data.text) {
          var tokens = tokenize(data.text),
            done=false;
          process.stdout.write('.');


          async.forEachSeries(tokens, function(t, cbnext) {
            var token_key = "t:"+t,
              token_user_key ="u:"+prompted.username+':'+t;

            client.get(token_key, function(err, doc) {
              // console.log(token_key, arguments)
              doc = incDoc(err, doc);
              client.set(token_key, JSON.stringify(doc), function() {
                // console.log(token_key, arguments[1])
                client.get(token_user_key, function(err, doc) {
                  doc = incDoc(err, doc);
                  client.set(token_user_key, JSON.stringify(doc), cbnext);
                });
              });
            });
          }, cb)
        };
      };

      function incDoc(err, doc) {
        if (err || !doc) {
          doc = {count:1};
        } else {
          try {
            doc = JSON.parse(doc);
          } catch(e) {
            doc = {count:0}
          }
          doc.count++;
        }
        return doc;
      };

      // need to buffer and make parseable...
      post.on("data", onSearchData)

      post.on("error", function(err) {
        console.error("Twitter connection error", err)
        process.exit(1)
      })
    })
  })
})
