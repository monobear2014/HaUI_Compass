"use client";
import { useEffect, useState } from "react";
export function AccountAvatar({ name }: { name: string }) {
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => {
      void fetch("/api/account/avatar", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((a) => {
          if (active) setImage(a?.image ?? null);
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("account-profile-updated", load);
    return () => {
      active = false;
      window.removeEventListener("account-profile-updated", load);
    };
  }, []);
  // Normalized, authenticated raster data; no remote image URL.
  return image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image}
      alt=""
      style={{
        width: "100%",
        height: "100%",
        borderRadius: "inherit",
        objectFit: "cover",
      }}
    />
  ) : (
    <>
      {name
        .split(/\s+/)
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase() || "SV"}
    </>
  );
}
