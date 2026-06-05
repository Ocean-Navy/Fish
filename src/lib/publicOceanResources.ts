import type { ComputeResource } from "@/lib/types";

export type PublicComputeResource = Omit<ComputeResource, "nodeEndpoint" | "raw">;

export function toPublicComputeResource({ nodeEndpoint: _nodeEndpoint, raw: _raw, ...resource }: ComputeResource): PublicComputeResource {
  return resource;
}
