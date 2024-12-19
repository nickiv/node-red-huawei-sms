const { XMLParser} = require("fast-xml-parser");

const parser = new XMLParser();

module.exports = function(RED) {
    function huaweiSmsGenericNode(n) {
        RED.nodes.createNode(this, n);
        var node = this;
        this.url = n.url;
        this.method = n.method;
        this.config = RED.nodes.getNode(n.config);
        node.on("input", function(msg, send, done){
          if (!this.config){
            done("No config node");
            return;
          }
          if (node.method == "POST"){
            const etree = parser.parse(msg.payload);
            if (!etree.hasOwnProperty("request")) {
              done(new Error("XML in payload must contain a request element"));
              return;
            }
          }
          var req = this.config.getModem().runGeneric(node.method, node.url, msg.payload);
          req.on("success", function(resp){
            msg.payload = resp;
            send(msg);
            done();
            return;
          });
          req.on("error", function(err){
            done(err);
          });
        });
    }

    RED.nodes.registerType("huawei-sms-generic", huaweiSmsGenericNode);
}