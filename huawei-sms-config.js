module.exports = function(RED) {
    function huaweiSmsAccount(n) {
        RED.nodes.createNode(this, n);
        this.ip = n.ip;
        this.admin_password = n.admin_password;
    }

    RED.nodes.registerType("huawei-sms-config", huaweiSmsAccount);
}