import { cn } from "@/lib/utils";

type ContentShellProps = {
  children: React.ReactNode;
  header: React.ReactNode;
  headerClassName?: string;
  mainClassName?: string;
  rootClassName?: string;
};

export function ContentShell({
  children,
  header,
  headerClassName,
  mainClassName,
  rootClassName,
}: ContentShellProps) {
  return (
    <div className={cn("flex min-w-0 flex-col", rootClassName)}>
      <header className={headerClassName}>{header}</header>
      <main className={mainClassName}>{children}</main>
    </div>
  );
}

