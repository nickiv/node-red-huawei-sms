const HuaweiModem = require("./huawei-modem");
const { XMLParser} = require("fast-xml-parser");
const TimeMachina = require("./src/time_machina");

const parser = new XMLParser();

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
        var modem = new HuaweiModem(this.ip, this.credentials.password);
        this.getModem = function(){
            return modem;
        }
        this.sm = new TimeMachina({
            namespace : "Huawei SmsRcv " + this.ip,
            node : node,
            initialize : function(){
              this.debug("intitalize");
              this.smsReceivers = [];
            },
            addReceiver : function(node){
                this.debug("addReceiver #" + node.id);
                this.smsReceivers[node.id] = node;
                this.handle("new_receiver");
            },
            delReceiver : function(node){
                if (node.id in this.smsReceivers){
                    this.debug("delReceiver #" + node.id);
                    delete this.smsReceivers[node.id];
                }
            },
            updateStatus : function(status){
                for (var id in this.smsReceivers){
                    this.debug("Updating status of receiver #" + id);
                    this.smsReceivers[id].updateStatus(status);
                }
            },
            states : {
              uninitialized : {
                new_receiver : "POLL",
                node_close : "CLOSED",
              },
              POLL : {
                _onEnter : function(){
                  var req = modem.getSms(1);
                  req.on("success", this.handle.bind(this, "poll_success"));
                  req.on("error", this.handle.bind(this, "poll_error"));
                  this.updateStatus({fill: "yellow", shape: "ring", text: "poll"});
                },
                poll_success : function(smsXML){
                  this.updateStatus({fill: "green", shape: "dot", text: "ok"});
                  var etree = parser.parse(smsXML);
                  if (!etree.hasOwnProperty("response")){
                    this.warn("Empty or incorrect getSms xml response", etree);
                    this.transition("IDLE");
                    return;
                  }
                  this.debug("Parsed xml", etree);
                  var messages = [];
                  if (etree.response.Count == 1){
                    messages.push(etree.response.Messages.Message);
                  } else  if (etree.response.Count > 1){
                    messages = messages.concat(etree.response.Messages.Message)
                  } else {
                    this.debug("No new messages");
                    this.transition("IDLE");
                    return;
                  }
                  this.debug("Messages", messages);
                  for (var i = 0; i < messages.length; i++){
                      var msg = {
                          payload : {
                              index      : messages[i].Index,
                              content : messages[i].Content.trim(),
                              date    : new Date(messages[i].Date),
                              phone  : messages[i].Phone,
                          }
                      }
                      for (var id in this.smsReceivers){
                          this.debug("Sending msg to receiver #" + id);
                          this.smsReceivers[id].sendme(msg);
                      }
                      var delReq = modem.delSms(messages[i].Index);
                      delReq.on("error", function(){
                        node.warn("delReq error");
                      });
                  }
                  this.transition("IDLE");
                },
                poll_error : function(err){
                  this.updateStatus({fill: "red", shape: "ring", text: err.message});
                  this.error(err);
                  this.transition("IDLE");
                },
                node_close : "CLOSED",
              },
              IDLE : {
                _onEnter : function(){
                  this._scheduleEvent("go_poll", 20000);
                },
                go_poll : function(){
                    for (var id in this.smsReceivers){
                        this.transition("POLL");
                        return;
                    }
                },
                node_close : "CLOSED",
                new_receiver : "POLL",
              },
              CLOSED : {

              }
            }
        });
        node.on("close", function(){
            this.sm.handle("node_close");
            this.sm = null;
        });
    }

    RED.nodes.registerType("huawei-sms-config", huaweiSmsAccount, {
        credentials: {
            password: { type : "password"}
        }
    });
}