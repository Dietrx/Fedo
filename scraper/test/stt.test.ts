import { test } from "node:test";
import assert from "node:assert/strict";
import { pcmToWav } from "../transcript/stt";

test("pcmToWav writes a valid 16-bit mono RIFF header and clamps samples", () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1.5, -1.5]);
  const wav = pcmToWav(samples, 16000);
  const view = new DataView(wav);
  const ascii = (o: number, n: number) => String.fromCharCode(...new Uint8Array(wav, o, n));
  assert.equal(wav.byteLength, 44 + samples.length * 2);
  assert.equal(ascii(0, 4), "RIFF");
  assert.equal(ascii(8, 4), "WAVE");
  assert.equal(view.getUint16(22, true), 1, "mono");
  assert.equal(view.getUint32(24, true), 16000, "sample rate");
  assert.equal(view.getUint16(34, true), 16, "bits per sample");
  assert.equal(view.getUint32(40, true), samples.length * 2, "data size");
  assert.equal(view.getInt16(44, true), 0);
  assert.equal(view.getInt16(46, true), Math.round(0.5 * 0x7fff));
  assert.equal(view.getInt16(48, true), Math.round(-0.5 * 0x8000));
  assert.equal(view.getInt16(50, true), 0x7fff, "clamped high");
  assert.equal(view.getInt16(52, true), -0x8000, "clamped low");
});
