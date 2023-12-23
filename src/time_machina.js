const machina = require('machina');

var log = console;

module.exports = machina.Fsm.extend({
    _fireEvent : function(event){
        delete this._scheduled_events[event];
        this.handle(event);
    },
    _scheduleEvent : function(event, timeout){
        if (!(event in this._scheduled_events)){
            this.debug('scheduling ' + event + ' for ' + timeout);
            this._scheduled_events[event] = setTimeout(this._fireEvent.bind(this, event), timeout);
        } else {
            this.warn('attempt to re-schedule event ' + event);
        }
    },
    _cancelEvent : function(event){
        if (event in this._scheduled_events){
            clearTimeout(this._scheduled_events[event]);
            delete this._scheduled_events[event];
        } else {
            this.debug('attempt to cancel not scheduled event ' + event);
        }
    },
    debug : function(){
      var args = [].slice.call(arguments);
      args.unshift(ts() + ' [debug] [' + this.namespace + ']');
      return log.debug.apply(log, args);
    },
    error : function(){
      var args = [].slice.call(arguments);
      args.unshift(ts() + ' [error] [' + this.namespace + ']');
      return log.error.apply(log, args);
    },
    info : function(){
      var args = [].slice.call(arguments);
      args.unshift(ts() + ' [info] [' + this.namespace + ']');
      return log.info.apply(log, args);
    },
    warn : function(){
      var args = [].slice.call(arguments);
      args.unshift(ts() + ' [warn] [' + this.namespace + ']');
      return log.warn.apply(log, args);
    },
    constructor : function(){
        this._scheduled_events = {};
        machina.Fsm.apply(this, arguments);
    }
});

function ts(){
    //return new Date().toISOString().slice(0, 19).replace('T', ' ');
    var date = new Date();

    var day = date.getDate();
    var monthIndex = date.getMonth();
    var hours = date.getHours();
    var minutes = date.getMinutes();
    var seconds = date.getSeconds();

    var monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    return day + ' ' + monthNames[monthIndex] + ' ' + 
        ("0" + hours).slice(-2) + ':' + 
        ("0" + minutes).slice(-2) + ':' + 
        ("0" + seconds).slice(-2);
}

machina.on('newfsm', function(sm){
    sm.on('handling', function (params) {
        this.debug('handling ' + params.inputType + ' in state ' + this.state);
    });

    sm.on('nohandler', function (params) {
        this.debug('unhandled ' + params.inputType + ' in state ' + this.state);
    });

    sm.on('transition', function (params) {
        this.debug(['transition from:', params.fromState, 'to:', params.toState, 'action:', params.action].join(' '));
    });
});
