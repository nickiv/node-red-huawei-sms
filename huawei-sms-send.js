const { XMLParser} = require("fast-xml-parser");

const parser = new XMLParser();

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
              var etree = parser.parse(smsXML);
              if (!etree.hasOwnProperty("response")){
                node.warn("Empty or incorrect getSms xml response", etree);
                return;
              }
              node.debug("Parsed xml", etree);
              var messages = [];
              if (etree.response.Count == 1){
                messages.push(etree.response.Messages.Message);
              } else  if (etree.response.Count > 1){
                messages = messages.concat(etree.response.Messages.Message)
              }
              node.debug("Messages", messages);
              for (var i = 0; i < messages.length; i++){
                let delReq = node.config.getModem().delSms(messages[i].Index);
                delReq.on("error", function(err){
                  node.warn(err.message);
                });
                delReq.on("success", function(res){
                  node.debug("delReq success", res);
                });
              }
            });
            listReq.on("error", function(err){
              node.warn(err.message);
            });
          });
          req.on("error", function(err){
            done(err);
          });
        });
    }

    RED.nodes.registerType("huawei-sms-send", huaweiSmsSendNode);
}