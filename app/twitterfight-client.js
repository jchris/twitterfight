var prompt = require('prompt'),
  fs = require('fs'),
  request = require('request'),
  twitterstream = require("../lib/twitterstream"),
  server = "http://mineral.local:8080/",
  colors = require("colors");


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

function registerUser(name) {
  request.post({uri : server + "user", json : {
    name : name,
    date : new Date()
  }}, function(err) {
    if (!err) {
      console.log("added @"+name+" to the leaderboard at "+server)
    } else {
      console.log(("error registering @"+name+" with "+server).red, err)
    }
  });
};

function withPrompted(err, p) {
  var first = true;
  twitterstream.search(p.username, p.password, p.terms, function(err, tweet) {
    if (err) {
      console.error("Twitter connection error", err)
      process.exit(1)
    }
    if (first) {
      // register our user with the server
      first = false;
      registerUser(p.username);
    }
    handleTweet(tweet, p.username);
  });
}

function handleTweet(tweet, name) {
  console.log("")
  console.log(tweet.text)
  console.log(("  @"+tweet.user.screen_name).blue)
  tweet.fight = {
    user : name,
    time : new Date()
  };
  request.post({uri : server + "input", json : tweet}, function(err) {
    if (!err) {
      console.log(("posted tweet by @"+tweet.user.screen_name+" to "+server).grey)
    } else {
      console.log(("error posting to "+server).red, err)
    }
  });
}

// GO!
promptSetup(withPrompted);
