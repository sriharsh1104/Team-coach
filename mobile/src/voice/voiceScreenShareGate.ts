/** Process-wide flag so Go Live / chat recording can refuse while voice screen share is on. */
let sharing = false;

export function setVoiceScreenSharing(active: boolean) {
  sharing = active;
}

export function isVoiceScreenSharing() {
  return sharing;
}
