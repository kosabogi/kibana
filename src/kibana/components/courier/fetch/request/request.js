define(function (require) {
  return function AbstractReqProvider(Private, Promise) {
    var _ = require('lodash');
    var moment = require('moment');
    var errors = require('errors');
    var requestQueue = Private(require('components/courier/_request_queue'));
    var requestErrorHandler = Private(require('components/courier/fetch/request/_error_handler'));

    function AbstractReq(source, defer) {
      if (!(this instanceof AbstractReq) || !this.constructor || this.constructor === AbstractReq) {
        throw new Error('The AbstractReq class should not be called directly');
      }

      this.source = source;
      this.defer = defer || Promise.defer();

      requestQueue.push(this);
    }

    AbstractReq.prototype.canStart = function () {
      return !this.stopped && !this.aborted && !this.source._fetchDisabled;
    };

    AbstractReq.prototype.start = function () {
      if (this.started) {
        throw new TypeError('Unable to start request because it has already started');
      }

      this.started = true;
      this.moment = moment();

      var source = this.source;
      if (source.activeFetchCount) {
        source.activeFetchCount += 1;
      } else {
        source.activeFetchCount = 1;
      }

      if (source.history) {
        source.history = _.first(source.history.concat(this), 20);
      }
    };

    AbstractReq.prototype.getFetchParams = function () {
      return this.source._flatten();
    };

    AbstractReq.prototype.transformResponse = function (resp) {
      return resp;
    };

    AbstractReq.prototype.handleResponse = function (resp) {
      this.success = true;
      this.resp = resp;
    };

    AbstractReq.prototype.handleFailure = function (error) {
      this.success = false;
      this.resp = error && error.resp;
      this.retry();
      return requestErrorHandler(this, error);
    };

    AbstractReq.prototype.isIncomplete = function () {
      return false;
    };

    AbstractReq.prototype.continue = function () {
      throw new Error('Unable to continue ' + this.type + ' request');
    };

    AbstractReq.prototype.retry = function () {
      var clone = this.clone();
      this.abort();
      return clone;
    };

    // don't want people overriding this, so it becomes a natural
    // part of .abort() and .complete()
    function stop(then) {
      return function () {
        if (this.stopped) {
          throw new TypeError('Unable to stop request because it has already stopped');
        }

        this.stopped = true;
        this.source.activeFetchCount -= 1;
        _.pull(requestQueue, this);
        then.call(this);
      };
    }

    AbstractReq.prototype.abort = stop(function () {
      this.defer = null;
      this.aborted = true;
      if (this._whenAborted) _.callEach(this._whenAborted);
    });

    AbstractReq.prototype.whenAborted = function (cb) {
      this._whenAborted = (this._whenAborted || []);
      this._whenAborted.push(cb);
    };

    AbstractReq.prototype.complete = stop(function () {
      this.ms = this.moment.diff() * -1;
      this.defer.resolve(this.resp);
    });

    AbstractReq.prototype.clone = function () {
      return new this.constructor(this.source, this.defer);
    };

    return AbstractReq;
  };
});