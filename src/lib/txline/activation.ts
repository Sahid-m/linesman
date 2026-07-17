export function buildActivationMessage(txSig: string, jwt: string): string {
  if (!txSig || !jwt) {
    throw new Error("Transaction signature and JWT are required");
  }
  return `${txSig}::${jwt}`;
}
