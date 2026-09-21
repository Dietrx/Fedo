#!/usr/bin/env bash
# Local speech-to-text companion for scraper/transcript/stt.ts.
#
# Starts whisper.cpp's HTTP server with the model kept in memory. Measured on an Apple M4 (2026-09-21):
# 5 s audio → 0.75 s, 10 s → 0.80 s per request with --audio-ctx 768 (the scraper sends ≤ 10 s windows).
# The server answers with `Access-Control-Allow-Origin: *`, so the content script on tiktok.com / x.com can
# post to it directly. Nothing leaves the machine.
#
# Install once:   brew install whisper-cpp
# Model (1.5 GB): https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin
#                 → ~/.cache/whisper/ggml-large-v3-turbo.bin  (or set FEDO_WHISPER_MODEL)
set -euo pipefail

MODEL="${FEDO_WHISPER_MODEL:-$HOME/.cache/whisper/ggml-large-v3-turbo.bin}"
PORT="${FEDO_WHISPER_PORT:-8181}"

if ! command -v whisper-server >/dev/null 2>&1; then
  echo "whisper-server not found. Install with: brew install whisper-cpp" >&2
  exit 1
fi
if [ ! -f "$MODEL" ]; then
  echo "Model not found: $MODEL" >&2
  echo "Download: https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin" >&2
  exit 1
fi

echo "[fedo] whisper-server on http://127.0.0.1:$PORT/inference (model: $MODEL)"
exec whisper-server -m "$MODEL" --host 127.0.0.1 --port "$PORT" --convert -t 8 -ac 768 "$@"
