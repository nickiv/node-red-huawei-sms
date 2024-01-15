const { XMLParser} = require("fast-xml-parser");

const parser = new XMLParser();

module.exports = function(RED) {
    function huaweiSmsSendNode(n) {
        RED.nodes.createNode(this, n);
        var node = this;
        this.phone = n.phone;
        this.config = RED.nodes.getNode(n.config);
        node.on("input", function(msg, send, done){
          if (!this.config){
            done("No config node");
            return;
          }
          let phone = node.phone;
          if (msg.hasOwnProperty("phone")){
            if (typeof msg.phone === "string"){
              phone = msg.phone;
            } else if (Array.isArray(msg.phone)){
              phone = msg.phone.join(";");
            }
          }
          var req = this.config.sendSms(phone, msg.payload);
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

    RED.nodes.registerType("huawei-sms-send", huaweiSmsSendNode);
}