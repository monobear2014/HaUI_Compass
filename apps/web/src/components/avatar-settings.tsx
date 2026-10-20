"use client";
import { useState } from "react";
import { AccountAvatar } from "./account-avatar";
export function AvatarSettings({ name, vi }: { name: string; vi: boolean }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function change(file: File | null) {
    if (file && file.size > 5 * 1024 * 1024) {
      setMessage(vi ? "Ảnh tối đa 5 MB." : "Maximum image size is 5 MB.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/account/avatar", {
        method: file ? "PUT" : "DELETE",
        body: file ?? undefined,
      });
      if (!r.ok) {
        setMessage(
          vi
            ? "Không đọc được ảnh. Chọn JPEG, PNG, WebP, GIF hoặc AVIF hợp lệ (tối đa 5 MB)."
            : "Choose a valid JPEG, PNG, WebP, GIF or AVIF image (up to 5 MB).",
        );
        return;
      }
      window.dispatchEvent(new Event("account-profile-updated"));
      setMessage(vi ? "Đã cập nhật ảnh đại diện." : "Profile picture updated.");
    } catch {
      setMessage(
        vi
          ? "Chưa lưu được ảnh. Hãy thử lại."
          : "Could not save picture. Please retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label={vi ? "Ảnh đại diện" : "Profile picture"}>
      <h3>{vi ? "Ảnh đại diện" : "Profile picture"}</h3>
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          overflow: "hidden",
          display: "grid",
          placeItems: "center",
          background: "var(--surface)",
        }}
      >
        <AccountAvatar name={name} />
      </div>
      <label>
        {vi ? "Tải ảnh đại diện" : "Upload profile picture"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif,.jpg,.jpeg,.png,.webp,.gif,.avif"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void change(f);
            e.target.value = "";
          }}
        />
      </label>
      <p>
        {vi
          ? "JPEG, PNG, WebP, GIF, AVIF · tối đa 5 MB"
          : "JPEG, PNG, WebP, GIF, AVIF · up to 5 MB"}
      </p>
      <button type="button" disabled={busy} onClick={() => void change(null)}>
        {vi ? "Dùng chữ viết tắt" : "Use initials"}
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
