const dns = require("dns").promises;

dns
  .resolveSrv("_mongodb._tcp.cluster0.amaorlm.mongodb.net")
  .then(console.log)
  .catch(console.error);
