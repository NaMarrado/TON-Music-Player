import { _classCallCheck, _createClass } from './soundtouch-runtime.js';
import { SimpleFilter, noop } from './soundtouch-filter.js';
import { SoundTouch } from './soundtouch-engine.js';

var WebAudioBufferSource = function () {
  function WebAudioBufferSource(buffer) {
    _classCallCheck(this, WebAudioBufferSource);
    this.buffer = buffer;
    this._position = 0;
  }
  return _createClass(WebAudioBufferSource, [{
    key: "dualChannel",
    get: function get() {
      return this.buffer.numberOfChannels > 1;
    }
  }, {
    key: "position",
    get: function get() {
      return this._position;
    },
    set: function set(value) {
      this._position = value;
    }
  }, {
    key: "extract",
    value: function extract(target) {
      var numFrames = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      var position = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
      this.position = position;
      var left = this.buffer.getChannelData(0);
      var right = this.dualChannel ? this.buffer.getChannelData(1) : this.buffer.getChannelData(0);
      var i = 0;
      for (; i < numFrames; i++) {
        target[i * 2] = left[i + position];
        target[i * 2 + 1] = right[i + position];
      }
      return Math.min(numFrames, left.length - position);
    }
  }]);
}();
var getWebAudioNode = function getWebAudioNode(context, filter) {
  var sourcePositionCallback = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : noop;
  var bufferSize = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 4096;
  var node = context.createScriptProcessor(bufferSize, 2, 2);
  var samples = new Float32Array(bufferSize * 2);
  node.onaudioprocess = function (event) {
    var left = event.outputBuffer.getChannelData(0);
    var right = event.outputBuffer.getChannelData(1);
    var framesExtracted = filter.extract(samples, bufferSize);
    sourcePositionCallback(filter.sourcePosition);
    if (framesExtracted === 0) {
      filter.onEnd();
    }
    var i = 0;
    for (; i < framesExtracted; i++) {
      left[i] = samples[i * 2];
      right[i] = samples[i * 2 + 1];
    }
  };
  return node;
};
var pad = function pad(n, width, z) {
  z = z || '0';
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
};
var minsSecs = function minsSecs(secs) {
  var mins = Math.floor(secs / 60);
  var seconds = secs - mins * 60;
  return "".concat(mins, ":").concat(pad(parseInt(seconds), 2));
};
var onUpdate = function onUpdate(sourcePosition) {
  var currentTimePlayed = this.timePlayed;
  var sampleRate = this.sampleRate;
  this.sourcePosition = sourcePosition;
  this.timePlayed = sourcePosition / sampleRate;
  if (currentTimePlayed !== this.timePlayed) {
    var timePlayed = new CustomEvent('play', {
      detail: {
        timePlayed: this.timePlayed,
        formattedTimePlayed: this.formattedTimePlayed,
        percentagePlayed: this.percentagePlayed
      }
    });
    this._node.dispatchEvent(timePlayed);
  }
};
(function () {
  function PitchShifter(context, buffer, bufferSize) {
    var _this4 = this;
    var onEnd = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : noop;
    _classCallCheck(this, PitchShifter);
    this._soundtouch = new SoundTouch();
    var source = new WebAudioBufferSource(buffer);
    this.timePlayed = 0;
    this.sourcePosition = 0;
    this._filter = new SimpleFilter(source, this._soundtouch, onEnd);
    this._node = getWebAudioNode(context, this._filter, function (sourcePostion) {
      return onUpdate.call(_this4, sourcePostion);
    }, bufferSize);
    this.tempo = 1;
    this.rate = 1;
    this.duration = buffer.duration;
    this.sampleRate = context.sampleRate;
    this.listeners = [];
  }
  return _createClass(PitchShifter, [{
    key: "formattedDuration",
    get: function get() {
      return minsSecs(this.duration);
    }
  }, {
    key: "formattedTimePlayed",
    get: function get() {
      return minsSecs(this.timePlayed);
    }
  }, {
    key: "percentagePlayed",
    get: function get() {
      return 100 * this._filter.sourcePosition / (this.duration * this.sampleRate);
    },
    set: function set(perc) {
      this._filter.sourcePosition = parseInt(perc * this.duration * this.sampleRate);
      this.sourcePosition = this._filter.sourcePosition;
      this.timePlayed = this.sourcePosition / this.sampleRate;
    }
  }, {
    key: "node",
    get: function get() {
      return this._node;
    }
  }, {
    key: "pitch",
    set: function set(pitch) {
      this._soundtouch.pitch = pitch;
    }
  }, {
    key: "pitchSemitones",
    set: function set(semitone) {
      this._soundtouch.pitchSemitones = semitone;
    }
  }, {
    key: "rate",
    set: function set(rate) {
      this._soundtouch.rate = rate;
    }
  }, {
    key: "tempo",
    set: function set(tempo) {
      this._soundtouch.tempo = tempo;
    }
  }, {
    key: "connect",
    value: function connect(toNode) {
      this._node.connect(toNode);
    }
  }, {
    key: "disconnect",
    value: function disconnect() {
      this._node.disconnect();
    }
  }, {
    key: "on",
    value: function on(eventName, cb) {
      this.listeners.push({
        name: eventName,
        cb: cb
      });
      this._node.addEventListener(eventName, function (event) {
        return cb(event.detail);
      });
    }
  }, {
    key: "off",
    value: function off() {
      var _this5 = this;
      var eventName = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;
      var listeners = this.listeners;
      if (eventName) {
        listeners = listeners.filter(function (e) {
          return e.name === eventName;
        });
      }
      listeners.forEach(function (e) {
        _this5._node.removeEventListener(e.name, function (event) {
          return e.cb(event.detail);
        });
      });
    }
  }]);
})();

export { WebAudioBufferSource, getWebAudioNode };
