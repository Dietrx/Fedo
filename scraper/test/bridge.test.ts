import { test } from "node:test";
import assert from "node:assert/strict";
import { BRIDGE_NS, isBridgeMessage, isReplayRequest } from "../bridge";

test("bridge messages are validated record by record (page code can post anything on this channel)", () => {
  assert.equal(isBridgeMessage({ ns: BRIDGE_NS, source: "fetch", records: [{ kind: "tiktok-item", item: {} }] }), true);
  assert.equal(isBridgeMessage({ ns: BRIDGE_NS, source: "fetch", records: [] }), true);
  assert.equal(isBridgeMessage({ ns: BRIDGE_NS, source: "fetch", records: [null] }), false, "null record");
  assert.equal(isBridgeMessage({ ns: BRIDGE_NS, source: "fetch", records: [{ item: {} }] }), false, "record without kind");
  assert.equal(isBridgeMessage({ ns: BRIDGE_NS, source: "fetch", records: "x" }), false);
  assert.equal(isBridgeMessage({ ns: "other", source: "fetch", records: [] }), false);
  assert.equal(isBridgeMessage(null), false);
  assert.equal(isBridgeMessage("string"), false);
});

test("replay requests are distinct from record messages", () => {
  assert.equal(isReplayRequest({ ns: BRIDGE_NS, request: "replay" }), true);
  assert.equal(isReplayRequest({ ns: BRIDGE_NS, source: "fetch", records: [] }), false);
  assert.equal(isBridgeMessage({ ns: BRIDGE_NS, request: "replay" }), false);
});
