"use client";
import Link from "next/link";
export function AssistantLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent("compass-open-assistant", {
            detail: {
              course: new URL(href, window.location.origin).searchParams.get(
                "course",
              ),
            },
          }),
        )
      }
    >
      {children}
    </Link>
  );
}
