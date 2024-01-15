const HuaweiModem = require("./huawei-modem");
const { XMLParser} = require("fast-xml-parser");
const TimeMachina = require("./src/time_machina");
// fix: require event emitter
const EventEmitter = require('events');

const parser = new XMLParser();

module.exports = function(RED) {
    function huaweiSmsAccount(config) {
        RED.nodes.createNode(this, config);
        this.ip = config.ip;
        this.debug = config.debug;
        var node = this;
        this.addReceiver = function(node){
            this.receiveProcessor.addReceiver(node);
        }
        this.delReceiver = function(node){
            this.receiveProcessor.delReceiver(node);
        }
        var modem = new HuaweiModem(this.ip, this.credentials.password, this.debug);
        this.getModem = function(){
            return modem;
        }
        this.sendSms = function(phone, content){
          return this.sendProcessor.sendSms(phone, content);
        }
        this.sendProcessor = new TimeMachina({
          namespace : "Huawei SmsSend " + this.ip,
          node: node,
          sendQueue : [],
          currentMessage: null,
          initialize : function(){
            if (!node.debug){
              this.debug = function(){}
            }
          },
          sendSms : function(phone, content){
            var sendEmitter = new EventEmitter();
            this.sendQueue.push({
              phone : phone,
              content : content,
              emitter : sendEmitter,
              retries: 0
            });
            this.handle("new_message");
            return sendEmitter;
          },
          cleanOutbox : function(){
            this.debug("cleanOutbox");
            var listReq = modem.getSms(2);
            var self = this;
            listReq.on("success", function(smsXML){
              var etree = parser.parse(smsXML);
              if (!etree.hasOwnProperty("response")){
                self.warn("Empty or incorrect getSms xml response", etree);
                return;
              }
              self.debug("Parsed xml", etree);
              var messages = [];
              if (etree.response.Count == 1){
                messages.push(etree.response.Messages.Message);
              } else  if (etree.response.Count > 1){
                messages = messages.concat(etree.response.Messages.Message)
              }
              self.debug("Messages", messages);
              for (var i = 0; i < messages.length; i++){
                let delReq = modem.delSms(messages[i].Index);
                delReq.on("error", function(err){
                  self.warn(err.message);
                });
                delReq.on("success", function(res){
                  self.debug("delReq success", res);
                });
              }
            });
            listReq.on("error", function(err){
              self.warn(err.message);
            });
          },
          states:{
            uninitialized: {
              new_message : "SENDING",
              node_close: "CLOSED",
            },
            SENDING: {
              _onEnter : function(){
                this.debug("Sending sms");
                this.currentMessage = this.sendQueue.shift();
                var req = modem.sendSms(this.currentMessage.phone, this.currentMessage.content);
                req.on("success", this.handle.bind(this, "send_success"));
                req.on("error", this.handle.bind(this, "send_error"));
              },
              send_success : function(resp){
                this.debug("Sms sent");
                this.currentMessage.emitter.emit("success", resp);
                this.transition("PAUSE_RL");
              },
              send_error : function(err){
                this.debug("Sms send error", err);
                this.currentMessage.retries += 1;
                if (this.currentMessage.retries > 1){
                  this.debug("No retries left", this.currentMessage.retries);
                  this.currentMessage.emitter.emit("error", err);
                  this.transition("PAUSE_RL");
                  return;
                }
                var etree = parser.parse(err.message);
                this.debug(etree);
                if (etree.hasOwnProperty('error')){
                  if (113004 == etree.error.code){
                    this.debug("Sms send error: 113004. Retry");
                    this.sendQueue.unshift(this.currentMessage);
                    this.transition("PAUSE_RL");
                    return;
                  }
                }
                this.currentMessage.emitter.emit("error", err);
                this.transition("PAUSE_RL");
              },
              node_close: "CLOSED",
            },
            PAUSE_RL: {
              _onEnter: function(){
                this.currentMessage = null;
                this._scheduleEvent("resume", 2000);
              },
              resume: function(){
                if (this.sendQueue.length > 0){
                  this.transition("SENDING");
                  return;
                }
                this.cleanOutbox();
                this.transition("uninitialized");
              },
              node_close: "CLOSED",
            },
            RETRY: {

            },
            CLOSED: {
              _onEnter: function(){
                this._cancelEvent("resume");
              }
            }
          }
        });
        this.receiveProcessor = new TimeMachina({
            namespace : "Huawei SmsRcv " + this.ip,
            node : node,
            initialize : function(){
              if (!node.debug){
                this.debug = function(){}
              }
              this.smsReceivers = [];
              this.pollInterval = 5000;
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
                              content : messages[i].Content.toString().trim(),
                              date    : new Date(messages[i].Date),
                              phone  : messages[i].Phone,
                          }
                      }
                      for (var id in this.smsReceivers){
                          this.debug("Sending msg to receiver #" + id);
                          this.smsReceivers[id].sendme(msg);
                      }
                      var delReq = modem.delSms(messages[i].Index);
                      delReq.on("error", this.warn.bind(this, "delReq error"));
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
                  this._scheduleEvent("go_poll", this.pollInterval);
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
                _onEnter : function(){
                    this._cancelEvent("go_poll");
                }
              }
            }
        });
        node.on("close", function(){
            this.receiveProcessor.handle("node_close");
            this.receiveProcessor = null;
            this.sendProcessor.handle("node_close");
            this.sendProcessor = null;
        });
    }

    RED.nodes.registerType("huawei-sms-config", huaweiSmsAccount, {
        credentials: {
            password: { type : "password"}
        }
    });
}