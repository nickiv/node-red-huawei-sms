module.exports = function(RED) {
    function huaweiSmsReceiveNode(n) {
        RED.nodes.createNode(this, n);
        this.config = RED.nodes.getNode(n.config);
        this.sendme = function(msg){
          this.send(msg);
        }
        this.updateStatus = function(status){
          this.status(status);
        }
        this.config.addReceiver(this);
        var self = this;
        this.on("close", function(){
          self.config.delReceiver(self);
        });
    }

    RED.nodes.registerType("huawei-sms-receive", huaweiSmsReceiveNode);
}