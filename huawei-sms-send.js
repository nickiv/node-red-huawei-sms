const api = require("./huawei-sms-api");

module.exports = function(RED) {
    function huaweiSmsSendNode(n) {
        RED.nodes.createNode(this, n);
        var node = this;
        this.phone = n.phone;
        this.config = RED.nodes.getNode(n.config);
        node.on("input", function(msg, send, done){
          var req = api.sendSms(node.config.ip, node.config.credentials.password, node.phone, msg.payload);
          req.on('success', function(resp){
            msg.payload = resp;
            send(msg);
            done();
          });
          req.on('error', function(err){
            done(err);
          });
        });
    }

    RED.nodes.registerType("huawei-sms-send", huaweiSmsSendNode);
}