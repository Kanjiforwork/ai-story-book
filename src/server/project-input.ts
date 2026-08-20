import { ValidationError } from "@/domain/validation";
import { decodeTextUpload } from "@/server/book-text";
import { loadSampleBook } from "@/server/sample-books";

export type ProjectInput = {
  title: unknown;
  bookText: string;
};

export async function parseProjectInput(
  request: Request,
): Promise<ProjectInput> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError("Send a valid JSON project payload.");
    }

    if (!body || typeof body !== "object") {
      throw new ValidationError("Send a project title and book text.");
    }
    const record = body as Record<string, unknown>;
    if (typeof record.bookText !== "string") {
      throw new ValidationError("Book text is required.");
    }
    return { title: record.title, bookText: record.bookText };
  }

  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new ValidationError("Send a valid multipart project payload.");
    }
    const file = formData.get("file");
    const sampleBookId = formData.get("sampleBookId");
    if (typeof sampleBookId === "string" && sampleBookId.trim()) {
      if (isUploadedFile(file)) {
        throw new ValidationError("Choose one book source.");
      }
      const pastedText = formData.get("bookText");
      if (typeof pastedText === "string" && pastedText.trim()) {
        throw new ValidationError("Choose one book source.");
      }
      return {
        title: formData.get("title"),
        bookText: loadSampleBook(sampleBookId).bookText,
      };
    }
    if (isUploadedFile(file)) {
      return {
        title: formData.get("title"),
        bookText: await decodeTextUpload(file),
      };
    }

    const bookText = formData.get("bookText");
    if (typeof bookText !== "string") {
      throw new ValidationError("Paste book text or choose a .txt file.");
    }
    return { title: formData.get("title"), bookText };
  }

  throw new ValidationError(
    "Use JSON or multipart form data to create a project.",
  );
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return (
    value !== null &&
    typeof value !== "string" &&
    typeof value.name === "string" &&
    typeof value.arrayBuffer === "function"
  );
}
