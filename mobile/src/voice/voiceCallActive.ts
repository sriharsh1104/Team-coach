/** Process-wide: true while a voice call is connected or connecting. */
let inCall = false;

export function setVoiceCallActive(active: boolean) {
  inCall = active;
}

export function isVoiceCallActive() {
  return inCall;
}
