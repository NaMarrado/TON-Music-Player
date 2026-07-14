import { _callSuper, _classCallCheck, _createClass, _inherits, _superPropGet } from './soundtouch-runtime.js';
import { AbstractFifoSamplePipe } from './soundtouch-buffer.js';

var RateTransposer = function (_AbstractFifoSamplePi) {
  function RateTransposer(createBuffers) {
    var _this;
    _classCallCheck(this, RateTransposer);
    _this = _callSuper(this, RateTransposer, [createBuffers]);
    _this.reset();
    _this._rate = 1;
    return _this;
  }
  _inherits(RateTransposer, _AbstractFifoSamplePi);
  return _createClass(RateTransposer, [{
    key: "rate",
    set: function set(rate) {
      this._rate = rate;
    }
  }, {
    key: "reset",
    value: function reset() {
      this.slopeCount = 0;
      this.prevSampleL = 0;
      this.prevSampleR = 0;
    }
  }, {
    key: "clear",
    value: function clear() {
      _superPropGet(RateTransposer, "clear", this)([]);
      this.reset();
    }
  }, {
    key: "clone",
    value: function clone() {
      var result = new RateTransposer();
      result.rate = this._rate;
      return result;
    }
  }, {
    key: "process",
    value: function process() {
      var numFrames = this._inputBuffer.frameCount;
      this._outputBuffer.ensureAdditionalCapacity(numFrames / this._rate + 1);
      var numFramesOutput = this.transpose(numFrames);
      this._inputBuffer.receive();
      this._outputBuffer.put(numFramesOutput);
    }
  }, {
    key: "transpose",
    value: function transpose() {
      var numFrames = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
      if (numFrames === 0) {
        return 0;
      }
      var src = this._inputBuffer.vector;
      var srcOffset = this._inputBuffer.startIndex;
      var dest = this._outputBuffer.vector;
      var destOffset = this._outputBuffer.endIndex;
      var used = 0;
      var i = 0;
      while (this.slopeCount < 1.0) {
        dest[destOffset + 2 * i] = (1.0 - this.slopeCount) * this.prevSampleL + this.slopeCount * src[srcOffset];
        dest[destOffset + 2 * i + 1] = (1.0 - this.slopeCount) * this.prevSampleR + this.slopeCount * src[srcOffset + 1];
        i = i + 1;
        this.slopeCount += this._rate;
      }
      this.slopeCount -= 1.0;
      if (numFrames !== 1) {
        out: while (true) {
          while (this.slopeCount > 1.0) {
            this.slopeCount -= 1.0;
            used = used + 1;
            if (used >= numFrames - 1) {
              break out;
            }
          }
          var srcIndex = srcOffset + 2 * used;
          dest[destOffset + 2 * i] = (1.0 - this.slopeCount) * src[srcIndex] + this.slopeCount * src[srcIndex + 2];
          dest[destOffset + 2 * i + 1] = (1.0 - this.slopeCount) * src[srcIndex + 1] + this.slopeCount * src[srcIndex + 3];
          i = i + 1;
          this.slopeCount += this._rate;
        }
      }
      this.prevSampleL = src[srcOffset + 2 * numFrames - 2];
      this.prevSampleR = src[srcOffset + 2 * numFrames - 1];
      return i;
    }
  }]);
}(AbstractFifoSamplePipe);

export { RateTransposer };
