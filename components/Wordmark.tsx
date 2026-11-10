import Link from "next/link";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="wordmark">
      Shopsitter
    </Link>
  );
}
