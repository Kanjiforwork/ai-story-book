import type { PipelineErrorCode } from "@/domain/pipeline";

export type PipelineStateCode =
  | PipelineErrorCode
  | "ASSET_WRITE_FAILED"
  | "NOT_FOUND"
  | "PORTRAIT_PARTIAL_FAILURE";

export class PipelineStateError extends Error {
  constructor(
    public readonly code: PipelineStateCode,
    message: string,
  ) {
    super(message);
    this.name = "PipelineStateError";
  }
}
