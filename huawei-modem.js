const http = require("http");
const crypto = require("crypto");
const util = require("util");

const TimeMachina = require("./src/time_machina");
const { EventEmitter } = require("stream");
const { nextTick } = require("process");

module.exports = TimeMachina.extend({
    namespace : 'HuaweiMdm',

    initialize : function(ip, password){
      this.debug('intitalize');
      this.csrf_token = null;
      this.cookie = null;
      this.login = 'admin';
      this.ip = ip;
      this.namespace += ' ' + this.ip;
      this.password = password;
      this.queue = [];
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
      this.info('queueRequest', method, args);
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
        this.debug('cookie', this.cookie);
      }
    },
    setCSRFToken : function(token){
      this.csrf_token = token;
      this.debug('CSRF token', this.csrf_token);
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
      this.info('processCommand', req.method, req.args);
      switch (req.method){
        case 'sms':
          this.request({
            url : '/api/sms/send-sms',
            method : 'POST',
            data : '<?xml version="1.0" encoding="UTF-8"?><request><Index>-1</Index><Phones><Phone>' + req.args[0] + '</Phone></Phones><Sca></Sca><Content>' + req.args[1] + '</Content><Length>' + req.args[1].length + '</Length><Reserved>1</Reserved><Date>2016-01-31 00:45:1</Date></request>'
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
    malfunction: function(err){
      this.error(err);
      this.currentRequest.res.emit('error', err);
      this.transition('uninitialized');
    },
    states : {
      GET_CSRF : {
        _onEnter : function(){
          this.request({
            url : '/html/index.html'
          });
        },
        http_success : function(res){
          if (res.statusCode != 200){
            this.malfunction(util.format('Request to /html/index.html failed with code %d', res.statusCode));
            return;
          }
  
          var strings = this.resp_data.split('\n');
          for (var i = 0; i < strings.length; i++){
            if (strings[i].trim().indexOf('<meta') == 0){
              var reg = new RegExp('name=\"csrf_token\"\\s+content=\"(.*)\"');
              var matches = reg.exec(strings[i]);
              if (matches){
                this.setCSRFToken(matches[1]);
                break;
              }
            }
          }
          if (!this.csrf_token){
            this.malfunction('No csrf token in /html/index.html');
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
            this.malfunction(util.format('Request to /api/user/login failed with code %d', res.statusCode));
            return;
          }
          if (this.resp_data.indexOf('<error>') >= 0){
            this.malfunction(this.resp_data);
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

