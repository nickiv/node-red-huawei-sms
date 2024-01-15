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
        if (this.config){// can be empty while not initialized
          this.config.addReceiver(this);
        }
        var self = this;
        this.on("close", function(){
          if (self.config){
            self.config.delReceiver(self);
          }
        });
    }

    RED.nodes.registerType("huawei-sms-receive", huaweiSmsReceiveNode);
}