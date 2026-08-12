// Builds the detective's line for a confrontation. Exactly ONE claim crosses
// between suspects — never a transcript. This is the deliberate, narrow break
// of SKILL.md section 10 documented in the design spec.
export function buildConfrontation(sourceClaim, targetClaim) {
  if (!sourceClaim || !targetClaim) return null;
  if (sourceClaim.suspectName === targetClaim.suspectName) return null;
  return {
    suspectName: targetClaim.suspectName,
    question: `${sourceClaim.suspectName} says: "${sourceClaim.assertion}" That does not square with what you have told me. Explain.`
  };
}
