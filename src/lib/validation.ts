/**
 * Shared validation helpers for API routes.
 *
 * Keep these dependency-free and side-effect-free so they can be imported
 * anywhere without pulling extra code into serverless bundles.
 */

/**
 * Narrow type guard for an Ethereum address: `0x` prefix followed by
 * exactly 40 hex characters. Accepts both lowercase and checksum-cased
 * variants; does not verify the EIP-55 checksum.
 */
export function isEthereumAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}
