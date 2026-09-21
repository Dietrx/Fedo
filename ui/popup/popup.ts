import { send } from "@contracts/messages";

const enabled = document.getElementById("enabled") as HTMLInputElement;
const minScore = document.getElementById("minScore") as HTMLInputElement;

send({ type: "fedo/getSettings" }).then((s) => {
  enabled.checked = s.enabled;
  // slider shows sensitivity: high sensitivity = low threshold
  minScore.value = String(1.2 - s.minScore);
});

enabled.addEventListener("change", () => send({ type: "fedo/setSettings", settings: { enabled: enabled.checked } }));
minScore.addEventListener("change", () => send({ type: "fedo/setSettings", settings: { minScore: 1.2 - Number(minScore.value) } }));
