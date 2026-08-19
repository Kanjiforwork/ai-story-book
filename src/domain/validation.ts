export class ValidationError extends Error {
  readonly code = "VALIDATION";

  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function normalizeName(value: unknown): string {
  if (typeof value !== "string") {
    throw new ValidationError("Name is required.");
  }

  const name = value.trim();
  if (!name || name.length > 100) {
    throw new ValidationError("Name must be between 1 and 100 characters.");
  }
  return name;
}

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw new ValidationError("Email is required.");
  }

  const email = value.trim().toLowerCase();
  if (
    !email ||
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new ValidationError("Enter a valid email address.");
  }
  return email;
}

export function normalizeProjectTitle(value: unknown): string {
  if (typeof value !== "string") {
    throw new ValidationError("Project title is required.");
  }

  const title = value.trim();
  if (!title || title.length > 120) {
    throw new ValidationError(
      "Project title must be between 1 and 120 characters.",
    );
  }
  return title;
}
