import { _classCallCheck, _createClass } from './soundtouch-runtime.js';

var FifoSampleBuffer = function () {
  function FifoSampleBuffer() {
    _classCallCheck(this, FifoSampleBuffer);
    this._vector = new Float32Array();
    this._position = 0;
    this._frameCount = 0;
  }
  return _createClass(FifoSampleBuffer, [{
    key: "vector",
    get: function get() {
      return this._vector;
    }
  }, {
    key: "position",
    get: function get() {
      return this._position;
    }
  }, {
    key: "startIndex",
    get: function get() {
      return this._position * 2;
    }
  }, {
    key: "frameCount",
    get: function get() {
      return this._frameCount;
    }
  }, {
    key: "endIndex",
    get: function get() {
      return (this._position + this._frameCount) * 2;
    }
  }, {
    key: "clear",
    value: function clear() {
      this._vector.fill(0);
      this._position = 0;
      this._frameCount = 0;
    }
  }, {
    key: "put",
    value: function put(numFrames) {
      this._frameCount += numFrames;
    }
  }, {
    key: "putSamples",
    value: function putSamples(samples, position) {
      var numFrames = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
      position = position || 0;
      var sourceOffset = position * 2;
      if (!(numFrames >= 0)) {
        numFrames = (samples.length - sourceOffset) / 2;
      }
      var numSamples = numFrames * 2;
      this.ensureCapacity(numFrames + this._frameCount);
      var destOffset = this.endIndex;
      this.vector.set(samples.subarray(sourceOffset, sourceOffset + numSamples), destOffset);
      this._frameCount += numFrames;
    }
  }, {
    key: "putBuffer",
    value: function putBuffer(buffer, position) {
      var numFrames = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
      position = position || 0;
      if (!(numFrames >= 0)) {
        numFrames = buffer.frameCount - position;
      }
      this.putSamples(buffer.vector, buffer.position + position, numFrames);
    }
  }, {
    key: "receive",
    value: function receive(numFrames) {
      if (!(numFrames >= 0) || numFrames > this._frameCount) {
        numFrames = this.frameCount;
      }
      this._frameCount -= numFrames;
      this._position += numFrames;
    }
  }, {
    key: "receiveSamples",
    value: function receiveSamples(output) {
      var numFrames = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      var numSamples = numFrames * 2;
      var sourceOffset = this.startIndex;
      output.set(this._vector.subarray(sourceOffset, sourceOffset + numSamples));
      this.receive(numFrames);
    }
  }, {
    key: "extract",
    value: function extract(output) {
      var position = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      var numFrames = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
      var sourceOffset = this.startIndex + position * 2;
      var numSamples = numFrames * 2;
      output.set(this._vector.subarray(sourceOffset, sourceOffset + numSamples));
    }
  }, {
    key: "ensureCapacity",
    value: function ensureCapacity() {
      var numFrames = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
      var minLength = parseInt(numFrames * 2);
      if (this._vector.length < minLength) {
        var newVector = new Float32Array(minLength);
        newVector.set(this._vector.subarray(this.startIndex, this.endIndex));
        this._vector = newVector;
        this._position = 0;
      } else {
        this.rewind();
      }
    }
  }, {
    key: "ensureAdditionalCapacity",
    value: function ensureAdditionalCapacity() {
      var numFrames = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
      this.ensureCapacity(this._frameCount + numFrames);
    }
  }, {
    key: "rewind",
    value: function rewind() {
      if (this._position > 0) {
        this._vector.set(this._vector.subarray(this.startIndex, this.endIndex));
        this._position = 0;
      }
    }
  }]);
}();
var AbstractFifoSamplePipe = function () {
  function AbstractFifoSamplePipe(createBuffers) {
    _classCallCheck(this, AbstractFifoSamplePipe);
    if (createBuffers) {
      this._inputBuffer = new FifoSampleBuffer();
      this._outputBuffer = new FifoSampleBuffer();
    } else {
      this._inputBuffer = this._outputBuffer = null;
    }
  }
  return _createClass(AbstractFifoSamplePipe, [{
    key: "inputBuffer",
    get: function get() {
      return this._inputBuffer;
    },
    set: function set(inputBuffer) {
      this._inputBuffer = inputBuffer;
    }
  }, {
    key: "outputBuffer",
    get: function get() {
      return this._outputBuffer;
    },
    set: function set(outputBuffer) {
      this._outputBuffer = outputBuffer;
    }
  }, {
    key: "clear",
    value: function clear() {
      this._inputBuffer.clear();
      this._outputBuffer.clear();
    }
  }]);
}();

export { AbstractFifoSamplePipe, FifoSampleBuffer };
