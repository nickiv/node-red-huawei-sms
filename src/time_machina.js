const machina = require('machina');

var log = console;

module.exports = machina.Fsm.extend({
    _fireEvent : function(event){
        delete this._scheduled_events[event];
        this.handle(event);
    },
    _scheduleEvent : function(event, timeout){
        if (!(event in this._scheduled_events)){
            log.debug(this.namespace + ': scheduling ' + event + ' for ' + timeout);
            this._scheduled_events[event] = setTimeout(this._fireEvent.bind(this, event), timeout);
        } else {
            log.debug(this.namespace + ': attempt to re-schedule event' + event);
        }
    },
    _cancelEvent : function(event){
        if (event in this._scheduled_events){
            clearTimeout(this._scheduled_events[event]);
            delete this._scheduled_events[event];
        } else {
            log.debug(this.namespace + ': attempt to cancel not scheduled event', event);
        }
    },
    debug : function(){
      var args = [].slice.call(arguments);
      args.unshift(this.namespace + ':');
      return log.debug.apply(log, args);
    },
    error : function(){
      var args = [].slice.call(arguments);
      args.unshift(this.namespace + ':');
      return log.error.apply(log, args);
    },
    info : function(){
      var args = [].slice.call(arguments);
      args.unshift(this.namespace + ':');
      return log.info.apply(log, args);
    },
    warn : function(){
      var args = [].slice.call(arguments);
      args.unshift(this.namespace + ':');
      return log.warn.apply(log, args);
    },
    constructor : function(){
        this._scheduled_events = {};
        machina.Fsm.apply(this, arguments);
    }
});

machina.on('newfsm', function(sm){
    sm.on('handling', function (params) {
        log.debug(this.namespace + ': handling ' + params.inputType + ' in state ' + this.state);
    });

    sm.on('nohandler', function (params) {
        log.debug(this.namespace + ': unhandled ' + params.inputType + ' in state ' + this.state);
    });

    sm.on('transition', function (params) {
        log.debug([this.namespace + ':', 'transition from:', params.fromState, 'to:', params.toState, 'action:', params.action].join(' '));
    });
});
