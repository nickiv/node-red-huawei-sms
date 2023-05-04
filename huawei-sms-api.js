const http = require("http");
const crypto = require("crypto");
//var et          = require('elementtree');

const TimeMachina = require('./src/time_machina');

const huaweiApiRequest = TimeMachina.extend({
    namespace : 'HuaweiApiRequest',

    initialize : function(ip, password, cmd){
      this.debug('intitalize');
      this.csrf_token = null;
      this.cookie = null;
      this.login = 'admin';
      this.ip = ip;
      this.password = password;
      this.command = cmd;
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
    states : {
      uninitialized : {
        _onEnter : function(){
          this.request({
            url : '/html/index.html'
          });
        },
        http_success : function(res){
          if (res.statusCode != 200){
            this.error('Odd status /html/index.html');
            this.emit('error', 'Statuscode=' . res.statusCode);
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
            this.error('No csrf token in /html/index.html');
            this.emit('error', 'No csrf token');
            return;
          }
          this.transition('AUTH');
        },
        http_error : function(err){
          this.error(err);
          this.emit('error', err);
        }
      },
      AUTH : {
        _onEnter : function(){
          var password_hash = crypto.createHash('sha256');
          var hash = crypto.createHash('sha256');
          password_hash.update(this.password);
          hash.update(this.login + new Buffer(password_hash.digest('hex')).toString('base64') + this.csrf_token);
          this.request({
            url : '/api/user/login',
            method : 'POST',
            data : '<?xml version="1.0" encoding="UTF-8"?><request><Username>' + this.login + '</Username><Password>' + new Buffer(hash.digest('hex')).toString('base64') + '</Password><password_type>4</password_type></request>'
          });
        },
        http_success : function(res){
          this.debug('login resp', this.resp_data, res.statusCode);
          if (res.statusCode != 200){
            return;
          }
          this.transition('WORK');
        },
        http_error : function(err){
          this.error(err);
          this.emit('error', err);
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
          this.transition('CLOSED');
        },
        http_error : function(err){
          this.error(err);
          this.emit('error', err);
        }
      },
      WORK : {
        _onEnter : function(){
          var command = this.command;
          this.info('processCommand', command.cmd, command.args);
          switch (command.cmd){
            case 'sms':
              this.request({
                url : '/api/sms/send-sms',
                method : 'POST',
                data : '<?xml version="1.0" encoding="UTF-8"?><request><Index>-1</Index><Phones><Phone>' + command.args[0] + '</Phone></Phones><Sca></Sca><Content>' + command.args[1] + '</Content><Length>' + command.args[1].length + '</Length><Reserved>1</Reserved><Date>2016-01-31 00:45:1</Date></request>'
              });
              break;
            case 'list':
              this.request({
                url : '/api/sms/sms-list',
                method : 'POST',
                data : '<?xml version="1.0" encoding="UTF-8"?><request><PageIndex>1</PageIndex><ReadCount>20</ReadCount><BoxType>' + command.args[0] + '</BoxType><SortType>0</SortType><Ascending>0</Ascending><UnreadPreferred>0</UnreadPreferred></request>'
              });
              break;
            case 'delete':
              this.request({
                url : '/api/sms/delete-sms',
                method : 'POST',
                data : '<?xml version="1.0" encoding="UTF-8"?><request><Index>' + command.args[0] + '</Index></request>'
              });
              break;
          }
        },
        http_success : function(res){
            if (this.resp_data.indexOf('<error>') >= 0){
              this.error('error response', this.resp_data);
              this.emit('error', this.resp_data);
              return;
            }
            this.debug(this.resp_data);/*
            switch (this.command.cmd){
              case 'list':
                if (typeof this.currentCommand.args[1] == 'function'){
                  var etree = et.parse(this.resp_data);
                  var msg_arr = [];
                  var messages = etree.findall('./Messages/Message');
                  if (messages){
                    for (var i = 0; i < messages.length; i++){
                      msg_arr.push({
                        id      : messages[i].findtext('Index'),
                        content : messages[i].findtext('Content'),
                        date    : messages[i].findtext('Date'),
                        sender  : messages[i].findtext('Phone'),
                      });
                    }
                  }
                  this.currentCommand.args[1](msg_arr);
                }
                break;
            }*/
            this.emit('success', this.resp_data);
            this.transition('LOGOUT');
        },
        http_error : function(err){
          this.error(err);
          this.emit('error', err);
        }
      }
    }
  });



module.exports = {
    sendSms: function(ip, password, phone, messageText){
        return new huaweiApiRequest(ip, password, {
          cmd : 'sms',
          args: [phone, messageText]
        });
    },
};
