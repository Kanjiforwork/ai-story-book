"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useLayoutEffect, useRef, useState } from "react";

import { SAMPLE_BOOKS, type SampleBookId } from "@/domain/sample-books";

export function NewProjectForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [bookText, setBookText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sampleBookId, setSampleBookId] = useState<SampleBookId | null>(null);
  const [loadingSampleBookId, setLoadingSampleBookId] =
    useState<SampleBookId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const bookTextAreaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sampleRequestId = useRef(0);

  useLayoutEffect(() => {
    if (!sampleBookId || !bookText || !bookTextAreaRef.current) return;
    bookTextAreaRef.current.scrollTop = 0;
    bookTextAreaRef.current.scrollLeft = 0;
  }, [bookText, sampleBookId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("title", title);
      if (sampleBookId) formData.set("sampleBookId", sampleBookId);
      else if (file) formData.set("file", file);
      else formData.set("bookText", bookText);

      const response = await fetch("/api/projects", {
        body: formData,
        method: "POST",
      });
      const payload = (await response.json()) as {
        message?: string;
        project?: { id: string };
      };
      if (!response.ok || !payload.project) {
        setError(payload.message ?? "We could not save this project.");
        return;
      }
      router.push(`/projects/${payload.project.id}`);
      router.refresh();
    } catch {
      setError("The server could not be reached. Try again.");
    } finally {
      setPending(false);
    }
  }

  function handleFileChange(nextFile: File | undefined) {
    setError(null);
    if (!nextFile) {
      setFile(null);
      return;
    }
    if (!nextFile.name.toLowerCase().endsWith(".txt")) {
      setFile(null);
      setError("Choose a plain .txt file.");
      return;
    }
    setBookText("");
    setFile(nextFile);
    clearSampleBook();
  }

  function handleBookTextChange(value: string) {
    setBookText(value);
    if (!value) return;
    clearFileInput();
    clearSampleBook();
  }

  function clearFileInput() {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function clearSampleBook() {
    sampleRequestId.current += 1;
    setLoadingSampleBookId(null);
    if (!sampleBookId) return;
    const sample = SAMPLE_BOOKS.find((book) => book.id === sampleBookId);
    setTitle((currentTitle) =>
      currentTitle === sample?.title ? "" : currentTitle,
    );
    setBookText("");
    setSampleBookId(null);
  }

  async function selectSampleBook(sampleId: SampleBookId) {
    const sample = SAMPLE_BOOKS.find((book) => book.id === sampleId);
    if (!sample) return;
    if (loadingSampleBookId === sampleId) {
      sampleRequestId.current += 1;
      setLoadingSampleBookId(null);
      return;
    }
    if (sampleBookId === sampleId) {
      clearSampleBook();
      return;
    }

    const requestId = sampleRequestId.current + 1;
    sampleRequestId.current = requestId;
    setError(null);
    setLoadingSampleBookId(sampleId);

    try {
      const response = await fetch(`/api/sample-books/${sampleId}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        bookText?: string;
        message?: string;
      };
      if (!response.ok || typeof payload.bookText !== "string") {
        throw new Error(payload.message ?? "We could not load this sample.");
      }
      if (sampleRequestId.current !== requestId) return;
      clearFileInput();
      setSampleBookId(sampleId);
      setTitle(sample.title);
      setBookText(payload.bookText);
    } catch (requestError) {
      if (sampleRequestId.current !== requestId) return;
      setError(
        requestError instanceof Error
          ? requestError.message
          : "We could not load this sample.",
      );
    } finally {
      if (sampleRequestId.current === requestId) {
        setLoadingSampleBookId(null);
      }
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div>
        <label
          className="mb-2 block text-sm font-semibold"
          htmlFor="project-title"
        >
          Project title
        </label>
        <input
          className="min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-base text-ink outline-none transition placeholder:text-ink-muted focus:border-orange focus:ring-4 focus:ring-orange/15"
          id="project-title"
          onChange={(event) => setTitle(event.target.value)}
          placeholder="The Wind in the Willows"
          required
          value={title}
        />
      </div>

      <fieldset>
        <legend className="mb-2 block text-sm font-semibold">
          Start with a sample book
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {SAMPLE_BOOKS.map((book) => {
            const selected = loadingSampleBookId
              ? loadingSampleBookId === book.id
              : sampleBookId === book.id;
            return (
              <button
                aria-busy={loadingSampleBookId === book.id}
                aria-pressed={selected}
                className={`min-h-24 rounded-xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange/15 ${selected ? "border-orange bg-orange/5" : "border-line bg-paper hover:border-orange/50"}`}
                key={book.id}
                onClick={() => void selectSampleBook(book.id)}
                type="button"
              >
                <span className="block text-sm font-semibold text-ink">
                  {book.title}
                </span>
                <span className="mt-1 block text-xs leading-5 text-ink-muted">
                  {book.author} · Public domain
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs leading-5 text-ink-muted">
          Or paste your own text or upload a file below.
        </p>
      </fieldset>

      <div>
        <label className="mb-2 block text-sm font-semibold" htmlFor="book-text">
          Book text
        </label>
        <textarea
          aria-busy={loadingSampleBookId !== null}
          aria-describedby="book-text-help"
          className="min-h-52 w-full resize-y rounded-xl border border-line bg-surface px-4 py-3 text-base leading-7 text-ink outline-none transition placeholder:text-ink-muted focus:border-orange focus:ring-4 focus:ring-orange/15 disabled:cursor-not-allowed disabled:bg-paper disabled:text-ink-body disabled:opacity-100"
          disabled={sampleBookId !== null || loadingSampleBookId !== null}
          id="book-text"
          onChange={(event) => handleBookTextChange(event.target.value)}
          placeholder="Paste the book text here…"
          ref={bookTextAreaRef}
          value={bookText}
        />
        <p
          className="mt-2 text-xs leading-5 text-ink-muted"
          id="book-text-help"
        >
          {sampleBookId
            ? "Sample text is filled in and locked. Select the same sample again to use your own text."
            : "Paste plain text or choose a .txt file below. Maximum 200,000 characters."}
          {loadingSampleBookId ? (
            <span className="sr-only" role="status">
              Loading the sample book text.
            </span>
          ) : null}
        </p>
      </div>

      <div className="rounded-2xl border border-dashed border-line bg-paper p-4">
        <label className="block text-sm font-semibold" htmlFor="book-file">
          Or upload a .txt file
        </label>
        <input
          accept=".txt,text/plain"
          className="mt-3 block w-full text-sm text-ink-body file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-ink file:px-3 file:font-semibold file:text-white hover:file:bg-ink-body"
          id="book-file"
          onChange={(event) => handleFileChange(event.target.files?.[0])}
          ref={fileInputRef}
          type="file"
        />
        {file ? (
          <p className="mt-3 text-sm font-semibold text-orange" role="status">
            Selected: {file.name}
          </p>
        ) : null}
      </div>

      {error ? (
        <p
          className="rounded-xl border border-orange/30 bg-orange/10 px-4 py-3 text-sm leading-6 text-orange-deep"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          className={`min-h-12 rounded-xl bg-orange px-5 text-sm font-bold text-white transition enabled:hover:bg-orange-hover disabled:cursor-wait ${pending ? "opacity-60" : ""}`}
          disabled={pending || loadingSampleBookId !== null}
          type="submit"
        >
          {pending ? "Saving project…" : "Create project"}
        </button>
        <Link
          className="inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold text-ink-body hover:bg-paper hover:text-ink"
          href="/projects"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
