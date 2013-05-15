var request = require("request");

exports.search = function(name, pass, terms, cb) {
  console.log("connecting to Twitter as @"+name+",\nsearching for ", terms);
  var twitterURL = 'https://'+name+':'+pass+'@stream.twitter.com/1.1/statuses/filter.json',
    post = request.post(twitterURL).form({track : terms});

  post.on("data", function(bytes) {
    try {
      var data = JSON.parse(bytes);
    } catch (err) {}
    if (data && data.text) {
      cb(false, data);
    };
  })

  post.on("error", cb)
}

