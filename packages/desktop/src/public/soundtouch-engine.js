import { _classCallCheck, _createClass } from './soundtouch-runtime.js';
import { FifoSampleBuffer } from './soundtouch-buffer.js';
import { RateTransposer } from './soundtouch-rate.js';
import { Stretch } from './soundtouch-stretch.js';

var testFloatEqual = function testFloatEqual(a, b) {
  return (a > b ? a - b : b - a) > 1e-10;
};
var SoundTouch = function () {
  function SoundTouch() {
    _classCallCheck(this, SoundTouch);
    this.transposer = new RateTransposer(false);
    this.stretch = new Stretch(false);
    this._inputBuffer = new FifoSampleBuffer();
    this._intermediateBuffer = new FifoSampleBuffer();
    this._outputBuffer = new FifoSampleBuffer();
    this._rate = 0;
    this._tempo = 0;
    this.virtualPitch = 1.0;
    this.virtualRate = 1.0;
    this.virtualTempo = 1.0;
    this.calculateEffectiveRateAndTempo();
  }
  return _createClass(SoundTouch, [{
    key: "clear",
    value: function clear() {
      this.transposer.clear();
      this.stretch.clear();
    }
  }, {
    key: "clone",
    value: function clone() {
      var result = new SoundTouch();
      result.rate = this.rate;
      result.tempo = this.tempo;
      return result;
    }
  }, {
    key: "rate",
    get: function get() {
      return this._rate;
    },
    set: function set(rate) {
      this.virtualRate = rate;
      this.calculateEffectiveRateAndTempo();
    }
  }, {
    key: "rateChange",
    set: function set(rateChange) {
      this._rate = 1.0 + 0.01 * rateChange;
    }
  }, {
    key: "tempo",
    get: function get() {
      return this._tempo;
    },
    set: function set(tempo) {
      this.virtualTempo = tempo;
      this.calculateEffectiveRateAndTempo();
    }
  }, {
    key: "tempoChange",
    set: function set(tempoChange) {
      this.tempo = 1.0 + 0.01 * tempoChange;
    }
  }, {
    key: "pitch",
    set: function set(pitch) {
      this.virtualPitch = pitch;
      this.calculateEffectiveRateAndTempo();
    }
  }, {
    key: "pitchOctaves",
    set: function set(pitchOctaves) {
      this.pitch = Math.exp(0.69314718056 * pitchOctaves);
      this.calculateEffectiveRateAndTempo();
    }
  }, {
    key: "pitchSemitones",
    set: function set(pitchSemitones) {
      this.pitchOctaves = pitchSemitones / 12.0;
    }
  }, {
    key: "inputBuffer",
    get: function get() {
      return this._inputBuffer;
    }
  }, {
    key: "outputBuffer",
    get: function get() {
      return this._outputBuffer;
    }
  }, {
    key: "calculateEffectiveRateAndTempo",
    value: function calculateEffectiveRateAndTempo() {
      var previousTempo = this._tempo;
      var previousRate = this._rate;
      this._tempo = this.virtualTempo / this.virtualPitch;
      this._rate = this.virtualRate * this.virtualPitch;
      if (testFloatEqual(this._tempo, previousTempo)) {
        this.stretch.tempo = this._tempo;
      }
      if (testFloatEqual(this._rate, previousRate)) {
        this.transposer.rate = this._rate;
      }
      if (this._rate > 1.0) {
        if (this._outputBuffer != this.transposer.outputBuffer) {
          this.stretch.inputBuffer = this._inputBuffer;
          this.stretch.outputBuffer = this._intermediateBuffer;
          this.transposer.inputBuffer = this._intermediateBuffer;
          this.transposer.outputBuffer = this._outputBuffer;
        }
      } else {
        if (this._outputBuffer != this.stretch.outputBuffer) {
          this.transposer.inputBuffer = this._inputBuffer;
          this.transposer.outputBuffer = this._intermediateBuffer;
          this.stretch.inputBuffer = this._intermediateBuffer;
          this.stretch.outputBuffer = this._outputBuffer;
        }
      }
    }
  }, {
    key: "process",
    value: function process() {
      if (this._rate > 1.0) {
        this.stretch.process();
        this.transposer.process();
      } else {
        this.transposer.process();
        this.stretch.process();
      }
    }
  }]);
}();

export { SoundTouch };
