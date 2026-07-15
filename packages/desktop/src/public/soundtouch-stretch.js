import { _callSuper, _classCallCheck, _createClass, _inherits, _superPropGet } from './soundtouch-runtime.js';
import { AbstractFifoSamplePipe } from './soundtouch-buffer.js';

var USE_AUTO_SEQUENCE_LEN = 0;
var DEFAULT_SEQUENCE_MS = USE_AUTO_SEQUENCE_LEN;
var USE_AUTO_SEEKWINDOW_LEN = 0;
var DEFAULT_SEEKWINDOW_MS = USE_AUTO_SEEKWINDOW_LEN;
var DEFAULT_OVERLAP_MS = 8;
var _SCAN_OFFSETS = [[124, 186, 248, 310, 372, 434, 496, 558, 620, 682, 744, 806, 868, 930, 992, 1054, 1116, 1178, 1240, 1302, 1364, 1426, 1488, 0], [-100, -75, -50, -25, 25, 50, 75, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [-20, -15, -10, -5, 5, 10, 15, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [-4, -3, -2, -1, 1, 2, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]];
var AUTOSEQ_TEMPO_LOW = 0.25;
var AUTOSEQ_TEMPO_TOP = 4.0;
var AUTOSEQ_AT_MIN = 125.0;
var AUTOSEQ_AT_MAX = 50.0;
var AUTOSEQ_K = (AUTOSEQ_AT_MAX - AUTOSEQ_AT_MIN) / (AUTOSEQ_TEMPO_TOP - AUTOSEQ_TEMPO_LOW);
var AUTOSEQ_C = AUTOSEQ_AT_MIN - AUTOSEQ_K * AUTOSEQ_TEMPO_LOW;
var AUTOSEEK_AT_MIN = 25.0;
var AUTOSEEK_AT_MAX = 15.0;
var AUTOSEEK_K = (AUTOSEEK_AT_MAX - AUTOSEEK_AT_MIN) / (AUTOSEQ_TEMPO_TOP - AUTOSEQ_TEMPO_LOW);
var AUTOSEEK_C = AUTOSEEK_AT_MIN - AUTOSEEK_K * AUTOSEQ_TEMPO_LOW;
var Stretch = function (_AbstractFifoSamplePi2) {
  function Stretch(createBuffers) {
    var _this3;
    _classCallCheck(this, Stretch);
    _this3 = _callSuper(this, Stretch, [createBuffers]);
    _this3._quickSeek = true;
    _this3.midBufferDirty = false;
    _this3.midBuffer = null;
    _this3.overlapLength = 0;
    _this3.autoSeqSetting = true;
    _this3.autoSeekSetting = true;
    _this3._tempo = 1;
    _this3.setParameters(44100, DEFAULT_SEQUENCE_MS, DEFAULT_SEEKWINDOW_MS, DEFAULT_OVERLAP_MS);
    return _this3;
  }
  _inherits(Stretch, _AbstractFifoSamplePi2);
  return _createClass(Stretch, [{
    key: "clear",
    value: function clear() {
      _superPropGet(Stretch, "clear", this)([]);
      this.clearMidBuffer();
    }
  }, {
    key: "clearMidBuffer",
    value: function clearMidBuffer() {
      this.midBufferDirty = false;
      this.midBuffer = null;
      if (this.refMidBuffer) {
        this.refMidBuffer.fill(0);
      }
      this.skipFract = 0;
    }
  }, {
    key: "setParameters",
    value: function setParameters(sampleRate, sequenceMs, seekWindowMs, overlapMs) {
      if (sampleRate > 0) {
        this.sampleRate = sampleRate;
      }
      if (overlapMs > 0) {
        this.overlapMs = overlapMs;
      }
      if (sequenceMs > 0) {
        this.sequenceMs = sequenceMs;
        this.autoSeqSetting = false;
      } else {
        this.autoSeqSetting = true;
      }
      if (seekWindowMs > 0) {
        this.seekWindowMs = seekWindowMs;
        this.autoSeekSetting = false;
      } else {
        this.autoSeekSetting = true;
      }
      this.calculateSequenceParameters();
      this.calculateOverlapLength(this.overlapMs);
      this.tempo = this._tempo;
    }
  }, {
    key: "tempo",
    get: function get() {
      return this._tempo;
    },
    set: function set(newTempo) {
      var intskip;
      this._tempo = newTempo;
      this.calculateSequenceParameters();
      this.nominalSkip = this._tempo * (this.seekWindowLength - this.overlapLength);
      this.skipFract = 0;
      intskip = Math.floor(this.nominalSkip + 0.5);
      this.sampleReq = Math.max(intskip + this.overlapLength, this.seekWindowLength) + this.seekLength;
    }
  }, {
    key: "inputChunkSize",
    get: function get() {
      return this.sampleReq;
    }
  }, {
    key: "outputChunkSize",
    get: function get() {
      return this.overlapLength + Math.max(0, this.seekWindowLength - 2 * this.overlapLength);
    }
  }, {
    key: "calculateOverlapLength",
    value: function calculateOverlapLength() {
      var overlapInMsec = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
      var newOvl;
      newOvl = this.sampleRate * overlapInMsec / 1000;
      newOvl = newOvl < 16 ? 16 : newOvl;
      newOvl -= newOvl % 8;
      this.overlapLength = newOvl;
      this.refMidBuffer = new Float32Array(this.overlapLength * 2);
      this.midBuffer = new Float32Array(this.overlapLength * 2);
    }
  }, {
    key: "checkLimits",
    value: function checkLimits(x, mi, ma) {
      return x < mi ? mi : x > ma ? ma : x;
    }
  }, {
    key: "calculateSequenceParameters",
    value: function calculateSequenceParameters() {
      var seq;
      var seek;
      if (this.autoSeqSetting) {
        seq = AUTOSEQ_C + AUTOSEQ_K * this._tempo;
        seq = this.checkLimits(seq, AUTOSEQ_AT_MAX, AUTOSEQ_AT_MIN);
        this.sequenceMs = Math.floor(seq + 0.5);
      }
      if (this.autoSeekSetting) {
        seek = AUTOSEEK_C + AUTOSEEK_K * this._tempo;
        seek = this.checkLimits(seek, AUTOSEEK_AT_MAX, AUTOSEEK_AT_MIN);
        this.seekWindowMs = Math.floor(seek + 0.5);
      }
      this.seekWindowLength = Math.floor(this.sampleRate * this.sequenceMs / 1000);
      this.seekLength = Math.floor(this.sampleRate * this.seekWindowMs / 1000);
    }
  }, {
    key: "quickSeek",
    set: function set(enable) {
      this._quickSeek = enable;
    }
  }, {
    key: "clone",
    value: function clone() {
      var result = new Stretch();
      result.tempo = this._tempo;
      result.setParameters(this.sampleRate, this.sequenceMs, this.seekWindowMs, this.overlapMs);
      return result;
    }
  }, {
    key: "seekBestOverlapPosition",
    value: function seekBestOverlapPosition() {
      return this._quickSeek ? this.seekBestOverlapPositionStereoQuick() : this.seekBestOverlapPositionStereo();
    }
  }, {
    key: "seekBestOverlapPositionStereo",
    value: function seekBestOverlapPositionStereo() {
      var bestOffset;
      var bestCorrelation;
      var correlation;
      var i = 0;
      this.preCalculateCorrelationReferenceStereo();
      bestOffset = 0;
      bestCorrelation = Number.MIN_VALUE;
      for (; i < this.seekLength; i = i + 1) {
        correlation = this.calculateCrossCorrelationStereo(2 * i, this.refMidBuffer);
        if (correlation > bestCorrelation) {
          bestCorrelation = correlation;
          bestOffset = i;
        }
      }
      return bestOffset;
    }
  }, {
    key: "seekBestOverlapPositionStereoQuick",
    value: function seekBestOverlapPositionStereoQuick() {
      var bestOffset;
      var bestCorrelation;
      var correlation;
      var scanCount = 0;
      var correlationOffset;
      var tempOffset;
      this.preCalculateCorrelationReferenceStereo();
      bestCorrelation = Number.MIN_VALUE;
      bestOffset = 0;
      correlationOffset = 0;
      tempOffset = 0;
      for (; scanCount < 4; scanCount = scanCount + 1) {
        var j = 0;
        while (_SCAN_OFFSETS[scanCount][j]) {
          tempOffset = correlationOffset + _SCAN_OFFSETS[scanCount][j];
          if (tempOffset >= this.seekLength) {
            break;
          }
          correlation = this.calculateCrossCorrelationStereo(2 * tempOffset, this.refMidBuffer);
          if (correlation > bestCorrelation) {
            bestCorrelation = correlation;
            bestOffset = tempOffset;
          }
          j = j + 1;
        }
        correlationOffset = bestOffset;
      }
      return bestOffset;
    }
  }, {
    key: "preCalculateCorrelationReferenceStereo",
    value: function preCalculateCorrelationReferenceStereo() {
      var i = 0;
      var context;
      var temp;
      for (; i < this.overlapLength; i = i + 1) {
        temp = i * (this.overlapLength - i);
        context = i * 2;
        this.refMidBuffer[context] = this.midBuffer[context] * temp;
        this.refMidBuffer[context + 1] = this.midBuffer[context + 1] * temp;
      }
    }
  }, {
    key: "calculateCrossCorrelationStereo",
    value: function calculateCrossCorrelationStereo(mixingPosition, compare) {
      var mixing = this._inputBuffer.vector;
      mixingPosition += this._inputBuffer.startIndex;
      var correlation = 0;
      var i = 2;
      var calcLength = 2 * this.overlapLength;
      var mixingOffset;
      for (; i < calcLength; i = i + 2) {
        mixingOffset = i + mixingPosition;
        correlation += mixing[mixingOffset] * compare[i] + mixing[mixingOffset + 1] * compare[i + 1];
      }
      return correlation;
    }
  }, {
    key: "overlap",
    value: function overlap(overlapPosition) {
      this.overlapStereo(2 * overlapPosition);
    }
  }, {
    key: "overlapStereo",
    value: function overlapStereo(inputPosition) {
      var input = this._inputBuffer.vector;
      inputPosition += this._inputBuffer.startIndex;
      var output = this._outputBuffer.vector;
      var outputPosition = this._outputBuffer.endIndex;
      var i = 0;
      var context;
      var tempFrame;
      var frameScale = 1 / this.overlapLength;
      var fi;
      var inputOffset;
      var outputOffset;
      for (; i < this.overlapLength; i = i + 1) {
        tempFrame = (this.overlapLength - i) * frameScale;
        fi = i * frameScale;
        context = 2 * i;
        inputOffset = context + inputPosition;
        outputOffset = context + outputPosition;
        output[outputOffset + 0] = input[inputOffset + 0] * fi + this.midBuffer[context + 0] * tempFrame;
        output[outputOffset + 1] = input[inputOffset + 1] * fi + this.midBuffer[context + 1] * tempFrame;
      }
    }
  }, {
    key: "process",
    value: function process() {
      var offset;
      var temp;
      var overlapSkip;
      if (this.midBuffer === null) {
        if (this._inputBuffer.frameCount < this.overlapLength) {
          return;
        }
        this.midBuffer = new Float32Array(this.overlapLength * 2);
        this._inputBuffer.receiveSamples(this.midBuffer, this.overlapLength);
      }
      while (this._inputBuffer.frameCount >= this.sampleReq) {
        offset = this.seekBestOverlapPosition();
        this._outputBuffer.ensureAdditionalCapacity(this.overlapLength);
        this.overlap(Math.floor(offset));
        this._outputBuffer.put(this.overlapLength);
        temp = this.seekWindowLength - 2 * this.overlapLength;
        if (temp > 0) {
          this._outputBuffer.putBuffer(this._inputBuffer, offset + this.overlapLength, temp);
        }
        var start = this._inputBuffer.startIndex + 2 * (offset + this.seekWindowLength - this.overlapLength);
        this.midBuffer.set(this._inputBuffer.vector.subarray(start, start + 2 * this.overlapLength));
        this.skipFract += this.nominalSkip;
        overlapSkip = Math.floor(this.skipFract);
        this.skipFract -= overlapSkip;
        this._inputBuffer.receive(overlapSkip);
      }
    }
  }]);
}(AbstractFifoSamplePipe);

export { Stretch };
