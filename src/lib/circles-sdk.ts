import { CirclesRpc } from "@aboutcircles/sdk-rpc";

const CIRCLES_RPC_URL = process.env.NEXT_PUBLIC_CIRCLES_RPC_URL || "https://rpc.aboutcircles.com/";

export const NF_GROUP_ADDRESS = "0x7Dd9f44C7F1A6788221a92305f9e7ea790675E9b".toLowerCase();
export const NF_TREASURY_ADDRESS = "0xbf57dc790ba892590c640dc27b26b2665d30104f".toLowerCase();

let rpcInstance: CirclesRpc | null = null;

export function getCirclesRpc(): CirclesRpc {
  if (!rpcInstance) {
    rpcInstance = new CirclesRpc(CIRCLES_RPC_URL);
  }
  return rpcInstance;
}
