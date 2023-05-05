const et    = require("elementtree");

module.exports = function(RED) {
    function huaweiSmsSendNode(n) {
        RED.nodes.createNode(this, n);
        var node = this;
        this.phone = n.phone;
        this.config = RED.nodes.getNode(n.config);
        node.on("input", function(msg, send, done){
          var req = this.config.getModem().sendSms(node.phone, msg.payload);
          req.on("success", function(resp){
            msg.payload = resp;
            send(msg);
            done();

            var listReq = node.config.getModem().getSms(2);
            listReq.on("success", function(smsXML){
              var etree = et.parse(smsXML);
              var messages = etree.findall("./Messages/Message");
              if (messages){
                for (var i = 0; i < messages.length; i++){
                  node.config.getModem().delSms(messages[i].findtext("Index"));
                }
              }
            });

          });
          req.on("error", function(err){
            done(err);
          });
        });
    }

    RED.nodes.registerType("huawei-sms-send", huaweiSmsSendNode);
}