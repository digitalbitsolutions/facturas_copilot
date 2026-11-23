export class DocumentReviewError extends Error {
  readonly code: "EX-02" | "EX-05";

  constructor(code: "EX-02" | "EX-05", message: string) {
    super(message);
    this.name = "DocumentReviewError";
    this.code = code;
  }
}
