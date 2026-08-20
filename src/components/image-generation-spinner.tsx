export function ImageGenerationSpinner({ label }: { label: string }) {
  return (
    <span
      className="absolute inset-0 flex items-center justify-center bg-surface px-4 text-center"
      role="status"
    >
      <span>
        <span aria-hidden="true" className="image-generation-spinner mx-auto" />
        <span className="mt-2 block text-[11px] leading-4 text-ink-body">
          {label}
        </span>
      </span>
    </span>
  );
}
