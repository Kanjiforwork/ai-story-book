type ResultFramePlaceholderProps = {
  kind: "portrait" | "chapter";
  label: string;
};

export function ResultFramePlaceholder({
  kind,
  label,
}: ResultFramePlaceholderProps) {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden bg-paper"
    >
      <div
        className={`absolute bg-surface/45 ${kind === "portrait" ? "inset-x-3 top-3 h-[42%]" : "inset-x-3 top-3 h-[58%]"}`}
        style={{
          clipPath:
            kind === "portrait"
              ? "polygon(0 0, 100% 0, 100% 78%, 66% 100%, 0 82%)"
              : "polygon(0 0, 100% 0, 100% 100%, 58% 72%, 0 54%)",
        }}
      />
      <div
        className={`absolute bg-ink/5 ${kind === "portrait" ? "bottom-3 right-3 h-[36%] w-[72%]" : "bottom-3 inset-x-3 h-[34%]"}`}
        style={{
          clipPath:
            kind === "portrait"
              ? "polygon(34% 0, 100% 0, 100% 100%, 0 100%)"
              : "polygon(0 0, 100% 42%, 100% 100%, 0 100%)",
        }}
      />
      <div className="absolute right-0 top-0 h-1/3 w-1/3 bg-orange/5" />
      <div className="absolute bottom-4 left-4 inline-flex min-h-8 items-center gap-2 rounded-lg bg-surface/85 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-orange-deep shadow-sm backdrop-blur-sm">
        <span className="h-1 w-4 rounded-full bg-orange" />
        {label}
      </div>
    </div>
  );
}
