const http = require("http");
const crypto = require("crypto");
const util = require("util");
const { XMLParser} = require("fast-xml-parser");
const parser = new XMLParser();

const TimeMachina = require("./src/time_machina");
const { EventEmitter } = require("stream");
const { nextTick } = require("process");

module.exports = TimeMachina.extend({
    namespace : 'HuaweiMdm',

    initialize : function(ip, password, debug){
      this.csrf_token = null;
      this.cookie = null;
      this.login = 'admin';
      this.ip = ip;
      this.namespace += ' ' + this.ip;
      if (password){
        this.password = password;
      } else {
        this.password = '';
      }
      this.queue = [];
      if (!debug){
        this.debug = function(){}
      }
    },
    sendSms : function(){
      return this.queueRequest('sms', arguments);
    },
    getSms : function(){
      return this.queueRequest('list', arguments);
    },
    delSms : function(){
      return this.queueRequest('delete', arguments);
    },
    queueRequest : function(method, args){
      this.debug('queueRequest', method, args);
      var resEmitter = new EventEmitter();
      process.nextTick(this.handle.bind(this, 'new_request', {
        method : method,
        args : args,
        res: resEmitter
      }));
      return resEmitter;
    },
    setCookie : function(res){
      if ('set-cookie' in res.headers){
        this.cookie = res.headers['set-cookie'][0].split(';')[0];
        this.debug('setCookie cookie', this.cookie);
      }
    },
    setCSRFToken : function(token){
      this.csrf_token = token;
      this.debug('CSRF token', this.csrf_token);
    },
    setSessionId : function(id){
      this.cookie = 'SessionID=' + id.replace("SessionID=", "");
      this.debug('setSessionId cookie', this.cookie);
    },
    request : function(params){
      var options = {
        path : params.url,
        host : this.ip,
        method : params.method || 'GET',
        timeout: 10000,
        headers : {},
      }
      if (this.csrf_token){
        options.headers.__RequestVerificationToken = this.csrf_token;
      }
      if (this.cookie){
        options.headers.Cookie = this.cookie;
      }
      if (params.data){
        options.headers['Content-Length'] = Buffer.byteLength(params.data, 'utf8');
      }
      this.debug(JSON.stringify(options));
      var req = http.request(options, this.processHTTPSuccess.bind(this));
      req.on('error', this.handle.bind(this, 'http_error'));
      req.on('timeout', function(){
        req.destroy();
      });
      if (params.data){
        this.debug('request data', params.data);
        req.write(params.data);
      }
      req.end();
    },
    processHTTPSuccess : function(res){
      res.setEncoding('utf8');
      if ('__requestverificationtokenone' in res.headers){
        this.setCSRFToken(res.headers['__requestverificationtokenone']);
      } else if ('__requestverificationtoken' in res.headers){
        this.setCSRFToken(res.headers['__requestverificationtoken']);
      } else {
        this.debug('No CSRF token in response headers');
      }
      this.setCookie(res);
      this.resp_data = '';
      res.on('data', this.processHTTPData.bind(this));
      res.on('end', this.handle.bind(this, 'http_success', res));
    },
    processHTTPData : function(chunk){
      this.resp_data += chunk;
    },
    processCommand : function(){
      var req = this.currentRequest;
      this.debug('processCommand', req.method, req.args);
      switch (req.method){
        case 'sms':
          let msg = req.args[1].toString().trim().substring(0, 300);
          this.request({
            url : '/api/sms/send-sms',
            method : 'POST',
            data : '<?xml version="1.0" encoding="UTF-8"?><request><Index>-1</Index><Phones><Phone>' + req.args[0] + '</Phone></Phones><Sca></Sca><Content>' + msg + '</Content><Length>' + msg.length + '</Length><Reserved>1</Reserved></request>'
          });
          break;
        case 'list':
          this.request({
            url : '/api/sms/sms-list',
            method : 'POST',
            data : '<?xml version="1.0" encoding="UTF-8"?><request><PageIndex>1</PageIndex><ReadCount>20</ReadCount><BoxType>' + req.args[0] + '</BoxType><SortType>0</SortType><Ascending>0</Ascending><UnreadPreferred>0</UnreadPreferred></request>'
          });
          break;
        case 'delete':
          this.request({
            url : '/api/sms/delete-sms',
            method : 'POST',
            data : '<?xml version="1.0" encoding="UTF-8"?><request><Index>' + req.args[0] + '</Index></request>'
          });
          break;
      }
    },
    malfunctionStr: function(str){
      return this.malfunction(new Error(str));
    },
    malfunction: function(err){
      this.error(err);
      this.currentRequest.res.emit('error', err);
      this.transition('uninitialized');
    },
    states : {
      GET_CSRF : {
        _onEnter : function(){
          this.request({
            url : '/api/webserver/SesTokInfo'
          });
        },
        http_success : function(res){
          if (res.statusCode != 200){
            this.malfunctionStr(util.format('Request to SesTokInfo failed with code %d', res.statusCode));
            return;
          }
          var etree = parser.parse(this.resp_data);
          if (!etree.hasOwnProperty("response")){
            this.malfunctionStr("Empty or incorrect SesTokInfo xml response");
            return;
          }
          this.debug("Parsed xml", etree);
 
          this.setCSRFToken(etree.response.TokInfo);
          this.setSessionId(etree.response.SesInfo);

          if (!this.csrf_token){
            this.malfunctionStr('No csrf token in SesTokInfo');
            return;
          }
          this.transition('AUTH');
        },
        http_error : function(err){
          this.malfunction(err);
        },
        new_request : function(req){
          this.queue.push(req);
        }
      },
      AUTH : {
        _onEnter : function(){
          if (this.password.length == 0){
            this.malfunctionStr('Empty password');
            return;
          }
          var password_hash = crypto.createHash('sha256');
          var hash = crypto.createHash('sha256');
          password_hash.update(this.password);
          hash.update(this.login + Buffer.from(password_hash.digest('hex')).toString('base64') + this.csrf_token);
          this.request({
            url : '/api/user/login',
            method : 'POST',
            data : '<?xml version="1.0" encoding="UTF-8"?><request><Username>' + this.login + '</Username><Password>' + Buffer.from(hash.digest('hex')).toString('base64') + '</Password><password_type>4</password_type></request>'
          });
        },
        http_success : function(res){
          this.debug('login resp', this.resp_data, res.statusCode);
          if (res.statusCode != 200){
            this.malfunctionStr(util.format('Request to /api/user/login failed with code %d', res.statusCode));
            return;
          }
          let etree = parser.parse(this.resp_data);
          if (etree.hasOwnProperty('error')){
            if (etree.error.code == 108006){
              this.malfunctionStr('Incorrect password');
              return;
            }
            this.malfunctionStr(this.resp_data);
            return;
          }
          if (!etree.hasOwnProperty('response')){
            this.malfunctionStr('Empty or incorrect login xml response');
            return;
          }
          this.transition('WORK');
        },
        http_error : function(err){
          this.error(err);
          this.currentRequest.res.emit('error', err);
          this.transition('uninitialized');
        },
        new_request : function(req){
          this.queue.push(req);
        }
      },
      LOGOUT : {
        _onEnter : function(){
          this.request({
            url : '/api/user/logout',
            method : 'POST',
            data : '<?xml version="1.0" encoding="UTF-8"?><request><Logout>1</Logout></request>'
          });
        },
        http_success : function(res){
          this.debug(this.resp_data);
          this.transition('uninitialized');
        },
        http_error : function(err){
          this.error(err);
          this.transition('uninitialized');
        },
        new_request : function(req){
          this.queue.push(req);
        }
      },
      WORK : {
        _onEnter : function(){
            this._cancelEvent('close_session');
            this.processCommand();
        },
        http_success : function(res){
            if (this.resp_data.indexOf('<error>') >= 0){
              this.error('error in command response', this.resp_data);
              this.currentRequest.res.emit('error', this.resp_data);
            } else {
              if (this.resp_data.length == 0){
                this.warn('Response is empty');
              } else {
                this.debug(this.resp_data);
              }
              this.currentRequest.res.emit('success', this.resp_data);
            }
            this.transition('IDLE');
        },
        http_error : function(err){
          this.malfunction(err);
        },
        new_request : function(req){
          this.queue.push(req);
        }
      },
      IDLE : {
        _onEnter : function(){
            this.currentRequest = this.queue.shift();
            if (this.currentRequest){
              this.transition('WORK');
            } else {
              this._scheduleEvent('close_session', 30000);
            }
        },
        close_session : 'LOGOUT',
        new_request : function(req){
          this.currentRequest = req;
          this.transition('WORK');
        }
      },
      uninitialized : {
        _onEnter : function(){
          this.cookie = null;
          this.csrf_token = null;
          this.currentRequest = this.queue.shift();
          if (this.currentRequest){
            this.transition('GET_CSRF');
          }
        },
        new_request : function(req){
          this.currentRequest = req;
          this.transition('GET_CSRF');
        }
      }
    }
  });

