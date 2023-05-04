const api = require("./huawei-sms-api");
const et          = require('elementtree');
const TimeMachina = require("./src/time_machina");

module.exports = function(RED) {
    function huaweiSmsAccount(n) {
        RED.nodes.createNode(this, n);
        this.ip = n.ip;
        var node = this;
        this.addReceiver = function(node){
            this.sm.addReceiver(node);
        }
        this.delReceiver = function(node){
            this.sm.delReceiver(node);
        }
        this.sm = new TimeMachina({
            namespace : "Huawei Receive SMS #" + node.id,
            node : node,
            initialize : function(){
              this.debug("intitalize");
              this.smsReceivers = [];
            },
            addReceiver : function(node){
                this.debug('addReceiver #' + node.id);
                this.smsReceivers[node.id] = node;
                this.handle('new_receiver');
            },
            delReceiver : function(node){
                if (node.id in this.smsReceivers){
                    this.debug('delReceiver #' + node.id);
                    delete this.smsReceivers[node.id];
                }
            },
            updateStatus : function(status){
                for (var id in this.smsReceivers){
                    this.debug('Updating status of receiver #' + id);
                    this.smsReceivers[id].updateStatus(status);
                }
            },
            states : {
              uninitialized : {
                new_receiver : 'POLL',
                node_close : 'CLOSED',
              },
              POLL : {
                _onEnter : function(){
                  //this.node.status({});
                  var req = api.getSms(node.ip, node.credentials.password);
                  req.on('success', this.handle.bind(this, 'poll_success'));
                  req.on('error', this.handle.bind(this, 'poll_error'));
                  this.updateStatus({fill: "yellow", shape: "ring", text: "poll"});
                },
                poll_success : function(smsXML){
                  this.updateStatus({fill: "green", shape: "dot", text: "ok"});
                  var etree = et.parse(smsXML);
                    var msg_arr = [];
                    var messages = etree.findall('./Messages/Message');
                    if (messages){
                      for (var i = 0; i < messages.length; i++){
                        var msg = {
                            payload : {
                                index      : messages[i].findtext('Index'),
                                content : messages[i].findtext('Content').trim(),
                                date    : new Date(messages[i].findtext('Date')),
                                phone  : messages[i].findtext('Phone'),
                            }
                        };
                        for (var id in this.smsReceivers){
                            this.debug('Sending msg to receiver #' + id);
                            this.smsReceivers[id].sendme(msg);
                        }

                        api.delSms(node.ip, node.credentials.password, messages[i].findtext('Index'));
                      }
                    }
                    this.transition('IDLE');
                },
                poll_error : function(err){
                  this.updateStatus({fill: "red", shape: "ring", text: err});
                  this.error(err);
                  this.transition('IDLE');
                },
                node_close : 'CLOSED',
              },
              IDLE : {
                _onEnter : function(){
                  this._scheduleEvent('go_poll', 20000);
                },
                go_poll : function(){

                },
                node_close : 'CLOSED',
              },
              CLOSED : {

              }
            }
        });
        node.on('close', function(){
            this.sm.handle('node_close');
            this.sm = null;
        });
    }

    RED.nodes.registerType("huawei-sms-config", huaweiSmsAccount, {
        credentials: {
            password: { type : "password"}
        }
    });
}