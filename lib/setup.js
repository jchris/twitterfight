var setup = {
  coux : require('coux'),
  mc : require("memcache")
}

module.exports = setup;

// be verbose in output
// setup.coux.log = ["PUT", "POST", "DELETE", "GET"];


// var bucketName = "default",
//   // uiHost = "http://localhost:8091";
//   uiHost = "http://localhost:9000";

setup.getPorts = function(uiHost, bucketName, cb) {
  setup.coux([uiHost, "pools", bucketName], function(err, data) {
    if (err) {
      console.error(err)
      cb(err)
    } else {
      var node = data.nodes[0];
      cb(false, {
        mc : node.ports.proxy,
        mcd : node.ports.direct,
        uiBucket : [uiHost, "couchBase", bucketName],
        xdcrBase : [node.couchApiBase, bucketName],
        xdcrVBucket : function(n) {
          return [node.couchApiBase, bucketName+"/"+n];
        },
        data : data
      })
    }
  })
};

setup.withMC = function(port, host, cb) {
  // console.log("mc", port, host);
  var client = new setup.mc.Client(port, host);
  client.on('connect', function() {
    cb(false, client, function() {
      client.close()
    });
  });
  client.on('error', function(error) {console.log(error)});
  client.connect();
}



setup.pollForIdWithTimeout = function(query, id, timeout, cb, start) {
  var now = new Date();
  start = start || now;
  if (timeout > 0) {
    setup.coux(query.concat({stale:false, key:id}), function(err, view) {
      if (err) {
        cb(err);
        return;
      }
      if (view.rows.length > 0) {
        cb(false, view)
      } else {
        console.log(""+query+" retry")
        setup.pollForIdWithTimeout(query, id, (timeout - (new Date() - now)), cb, start)
      }
    })
  } else {
    cb(""+query+" timeout exceeded by "+(timeout*-1)+", took "+(new Date() - start))
  }
};
