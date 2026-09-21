import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cuesToText, parseVtt, parseVttTimestamp } from "../transcript/captions";

const capture = JSON.parse(readFileSync(new URL("./fixtures/tiktok-capture.json", import.meta.url), "utf8")) as {
  vtt: { cues: number; text: string };
};

test("real TikTok WebVTT file parses into the same number of cues the capture counted", () => {
  const cues = parseVtt(capture.vtt.text);
  assert.equal(cues.length, capture.vtt.cues);
  assert.equal(cues[0]!.start, 0.74);
  assert.equal(cues[0]!.end, 3.74);
  assert.equal(cues[0]!.text, "Hello, I just got a new bag.");
  for (let i = 1; i < cues.length; i++) assert.ok(cues[i]!.start >= cues[i - 1]!.start, "cues are in playback order");
  assert.ok(cuesToText(cues).startsWith("Hello, I just got a new bag. Normally I don't really get bags"));
});

test("timestamps with and without hours, comma decimals, tags and CRLF", () => {
  assert.equal(parseVttTimestamp("00:01:02.500"), 62.5);
  assert.equal(parseVttTimestamp("01:02.5"), 62.5);
  assert.equal(parseVttTimestamp("00:00:01,250"), 1.25);
  assert.equal(parseVttTimestamp("garbage"), null);
  const cues = parseVtt("WEBVTT\r\n\r\n1\r\n00:00.000 --> 00:01.000 align:start\r\n<v Speaker>Hi <b>there</b>\r\n\r\n00:01.000 --> 00:02.000\r\n\r\n");
  assert.equal(cues.length, 1);
  assert.equal(cues[0]!.text, "Hi there");
});
