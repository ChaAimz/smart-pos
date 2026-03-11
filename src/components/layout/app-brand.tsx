import { cn } from "@/lib/utils";

type AppBrandProps = {
  className?: string;
  iconClassName?: string;
  labelClassName?: string;
  hideLabel?: boolean;
};

export function AppBrand({
  className,
  iconClassName,
  labelClassName,
  hideLabel = false,
}: AppBrandProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "relative flex size-9 items-center justify-center rounded-xl border border-primary/35 bg-primary/10 text-[11px] font-black tracking-[0.2em] text-primary shadow-xs",
          iconClassName
        )}
      >
        SP
        <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-primary" />
      </span>
      {hideLabel ? null : (
        <span
          className={cn(
            "text-lg font-semibold leading-none tracking-tight md:text-xl",
            labelClassName
          )}
        >
          <span className="lowercase">smart</span>{" "}
          <span className="uppercase">POS</span>
        </span>
      )}
    </div>
  );
}
