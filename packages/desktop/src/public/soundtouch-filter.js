import { _callSuper, _classCallCheck, _createClass, _inherits, _superPropGet } from './soundtouch-runtime.js';

var FilterSupport = function () {
  function FilterSupport(pipe) {
    _classCallCheck(this, FilterSupport);
    this._pipe = pipe;
  }
  return _createClass(FilterSupport, [{
    key: "pipe",
    get: function get() {
      return this._pipe;
    }
  }, {
    key: "inputBuffer",
    get: function get() {
      return this._pipe.inputBuffer;
    }
  }, {
    key: "outputBuffer",
    get: function get() {
      return this._pipe.outputBuffer;
    }
  }, {
    key: "fillInputBuffer",
    value: function fillInputBuffer() {
      throw new Error('fillInputBuffer() not overridden');
    }
  }, {
    key: "fillOutputBuffer",
    value: function fillOutputBuffer() {
      var numFrames = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
      while (this.outputBuffer.frameCount < numFrames) {
        var numInputFrames = 8192 * 2 - this.inputBuffer.frameCount;
        this.fillInputBuffer(numInputFrames);
        if (this.inputBuffer.frameCount < 8192 * 2) {
          break;
        }
        this._pipe.process();
      }
    }
  }, {
    key: "clear",
    value: function clear() {
      this._pipe.clear();
    }
  }]);
}();
var noop = function noop() {
  return;
};
var SimpleFilter = function (_FilterSupport) {
  function SimpleFilter(sourceSound, pipe) {
    var _this2;
    var callback = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : noop;
    _classCallCheck(this, SimpleFilter);
    _this2 = _callSuper(this, SimpleFilter, [pipe]);
    _this2.callback = callback;
    _this2.sourceSound = sourceSound;
    _this2.historyBufferSize = 22050;
    _this2._sourcePosition = 0;
    _this2.outputBufferPosition = 0;
    _this2._position = 0;
    return _this2;
  }
  _inherits(SimpleFilter, _FilterSupport);
  return _createClass(SimpleFilter, [{
    key: "position",
    get: function get() {
      return this._position;
    },
    set: function set(position) {
      if (position > this._position) {
        throw new RangeError('New position may not be greater than current position');
      }
      var newOutputBufferPosition = this.outputBufferPosition - (this._position - position);
      if (newOutputBufferPosition < 0) {
        throw new RangeError('New position falls outside of history buffer');
      }
      this.outputBufferPosition = newOutputBufferPosition;
      this._position = position;
    }
  }, {
    key: "sourcePosition",
    get: function get() {
      return this._sourcePosition;
    },
    set: function set(sourcePosition) {
      this.clear();
      this._sourcePosition = sourcePosition;
    }
  }, {
    key: "onEnd",
    value: function onEnd() {
      this.callback();
    }
  }, {
    key: "fillInputBuffer",
    value: function fillInputBuffer() {
      var numFrames = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
      var samples = new Float32Array(numFrames * 2);
      var numFramesExtracted = this.sourceSound.extract(samples, numFrames, this._sourcePosition);
      this._sourcePosition += numFramesExtracted;
      this.inputBuffer.putSamples(samples, 0, numFramesExtracted);
    }
  }, {
    key: "extract",
    value: function extract(target) {
      var numFrames = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      this.fillOutputBuffer(this.outputBufferPosition + numFrames);
      var numFramesExtracted = Math.min(numFrames, this.outputBuffer.frameCount - this.outputBufferPosition);
      this.outputBuffer.extract(target, this.outputBufferPosition, numFramesExtracted);
      var currentFrames = this.outputBufferPosition + numFramesExtracted;
      this.outputBufferPosition = Math.min(this.historyBufferSize, currentFrames);
      this.outputBuffer.receive(Math.max(currentFrames - this.historyBufferSize, 0));
      this._position += numFramesExtracted;
      return numFramesExtracted;
    }
  }, {
    key: "handleSampleData",
    value: function handleSampleData(event) {
      this.extract(event.data, 4096);
    }
  }, {
    key: "clear",
    value: function clear() {
      _superPropGet(SimpleFilter, "clear", this)([]);
      this.outputBufferPosition = 0;
    }
  }]);
}(FilterSupport);

export { FilterSupport, SimpleFilter, noop };
