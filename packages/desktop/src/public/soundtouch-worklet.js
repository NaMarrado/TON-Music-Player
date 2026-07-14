/*
* SoundTouch Audio Worklet v0.3.0 AudioWorklet using the
* SoundTouch audio processing library
* 
* Copyright (c) Olli Parviainen
* Copyright (c) Ryan Berdeen
* Copyright (c) Jakub Fiala
* Copyright (c) Steve 'Cutter' Blades
*
* This library is free software; you can redistribute it and/or
* modify it under the terms of the GNU Lesser General Public
* License as published by the Free Software Foundation; either
* version 2.1 of the License, or (at your option) any later version.
*
* This library is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
* Lesser General Public License for more details.
*
* You should have received a copy of the GNU Lesser General Public
* License along with this library; if not, write to the Free Software
* Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA
*/

import {
  _callSuper,
  _classCallCheck,
  _createClass,
  _inherits,
  _wrapNativeSuper,
} from './soundtouch-runtime.js';
import { SoundTouch } from './soundtouch-engine.js';

var SoundTouchWorklet = function (_AudioWorkletProcesso) {
  function SoundTouchWorklet() {
    var _this;
    _classCallCheck(this, SoundTouchWorklet);
    _this = _callSuper(this, SoundTouchWorklet);
    _this.bufferSize = 128;
    _this._samples = new Float32Array(_this.bufferSize * 2);
    _this._pipe = new SoundTouch();
    return _this;
  }
  _inherits(SoundTouchWorklet, _AudioWorkletProcesso);
  return _createClass(SoundTouchWorklet, [{
    key: "process",
    value: function process(inputs, outputs, parameters) {
      var _parameters$rate$, _parameters$tempo$, _parameters$pitch$, _parameters$pitchSemi;
      if (!inputs[0].length) return true;
      var leftInput = inputs[0][0];
      var rightInput = inputs[0].length > 1 ? inputs[0][1] : inputs[0][0];
      var leftOutput = outputs[0][0];
      var rightOutput = outputs[0].length > 1 ? outputs[0][1] : outputs[0][0];
      var samples = this._samples;
      if (!leftOutput || !leftOutput.length) return false;
      var rate = (_parameters$rate$ = parameters.rate[0]) !== null && _parameters$rate$ !== void 0 ? _parameters$rate$ : parameters.rate;
      var tempo = (_parameters$tempo$ = parameters.tempo[0]) !== null && _parameters$tempo$ !== void 0 ? _parameters$tempo$ : parameters.tempo;
      var pitch = (_parameters$pitch$ = parameters.pitch[0]) !== null && _parameters$pitch$ !== void 0 ? _parameters$pitch$ : parameters.pitch;
      var pitchSemitones = (_parameters$pitchSemi = parameters.pitchSemitones[0]) !== null && _parameters$pitchSemi !== void 0 ? _parameters$pitchSemi : parameters.pitchSemitones;
      this._pipe.rate = rate;
      this._pipe.tempo = tempo;
      this._pipe.pitch = pitch * Math.pow(2, pitchSemitones / 12);
      for (var i = 0; i < leftInput.length; i++) {
        samples[i * 2] = leftInput[i];
        samples[i * 2 + 1] = rightInput[i];
      }
      this._pipe.inputBuffer.putSamples(samples, 0, leftInput.length);
      this._pipe.process();
      var processedSamples = new Float32Array(leftInput.length * 2);
      this._pipe.outputBuffer.receiveSamples(processedSamples, leftOutput.length);
      for (var _i = 0; _i < leftInput.length; _i++) {
        leftOutput[_i] = processedSamples[_i * 2];
        rightOutput[_i] = processedSamples[_i * 2 + 1];
        if (isNaN(leftOutput[_i]) || isNaN(rightOutput[_i])) {
          leftOutput[_i] = 0;
          rightOutput[_i] = 0;
        }
      }
      return true;
    }
  }], [{
    key: "parameterDescriptors",
    get: function get() {
      return [{
        name: 'rate',
        defaultValue: 1.0,
        minValue: 0.25,
        maxValue: 4.0
      }, {
        name: 'tempo',
        defaultValue: 1.0,
        minValue: 0.25,
        maxValue: 4.0
      }, {
        name: 'pitch',
        defaultValue: 1.0,
        minValue: 0.25,
        maxValue: 4.0
      }, {
        name: 'pitchSemitones',
        defaultValue: 0,
        minValue: -24,
        maxValue: 24
      }];
    }
  }]);
}(_wrapNativeSuper(AudioWorkletProcessor));
registerProcessor('soundtouch-processor', SoundTouchWorklet);
