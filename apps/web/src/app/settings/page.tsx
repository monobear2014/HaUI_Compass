"use client";
import { AvatarSettings } from "@/components/avatar-settings";
import { useEffect, useState } from "react";
import { usePreferences } from "@/components/preferences";
import styles from "./settings.module.css";

type Account = {
  user: { id: string; name: string; username: string };
  profile: { birth_date: string | null; major: string; bio: string };
  login_method: string;
};
export default function SettingsPage() {
  const { language } = usePreferences();
  const vi = language === "vi";
  const c = (a: string, b: string) => (vi ? a : b);
  const [account, setAccount] = useState<Account | null>(null),
    [attempt, setAttempt] = useState(0);
  const [name, setName] = useState(""),
    [birth, setBirth] = useState(""),
    [major, setMajor] = useState(""),
    [bio, setBio] = useState("");
  const [current, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false),
    [changing, setChanging] = useState(false),
    [error, setError] = useState(""),
    [passwordError, setPasswordError] = useState(""),
    [notice, setNotice] = useState(""),
    [passwordNotice, setPasswordNotice] = useState("");
  useEffect(() => {
    let active = true;
    void fetch("/api/account", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const a: Account = await r.json();
        if (active) {
          setAccount(a);
          setName(a.user.name);
          setBirth(a.profile.birth_date || "");
          setMajor(a.profile.major);
          setBio(a.profile.bio);
          setError("");
        }
      })
      .catch(() => {
        if (active) setError("load_failed");
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, birth_date: birth || null, major, bio }),
      });
      if (!r.ok) {
        const e = await r.json();
        setError(
          e.error === "invalid_birth_date"
            ? c(
                "Ngày sinh không hợp lệ hoặc ở tương lai.",
                "Birth date is invalid or in the future.",
              )
            : c(
                "Chưa lưu được hồ sơ. Vui lòng thử lại.",
                "Could not save your profile. Please retry.",
              ),
        );
        return;
      }
      const a: Account = await r.json();
      setAccount(a);
      setName(a.user.name);
      setMajor(a.profile.major);
      setBio(a.profile.bio);
      setNotice(c("Đã lưu thông tin cá nhân.", "Personal information saved."));
      window.dispatchEvent(new Event("account-profile-updated"));
    } catch {
      setError(
        c("Mất kết nối. Vui lòng thử lại.", "Connection failed. Please retry."),
      );
    } finally {
      setSaving(false);
    }
  }
  async function change(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError("");
    setPasswordNotice("");
    if (password !== confirm) {
      setPasswordError(
        c(
          "Mật khẩu xác nhận chưa khớp.",
          "Password confirmation does not match.",
        ),
      );
      return;
    }
    setChanging(true);
    try {
      const r = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: current,
          new_password: password,
        }),
      });
      if (!r.ok) {
        const e = await r.json();
        setPasswordError(
          e.error === "invalid_credentials"
            ? c(
                "Mật khẩu hiện tại chưa đúng.",
                "Current password is incorrect.",
              )
            : e.error === "password_unchanged"
              ? c(
                  "Mật khẩu mới phải khác mật khẩu hiện tại.",
                  "Choose a different new password.",
                )
              : e.error === "too_many_attempts"
                ? c(
                    "Bạn thử quá nhiều lần. Hãy đợi rồi thử lại.",
                    "Too many attempts. Wait before retrying.",
                  )
                : c(
                    "Chưa đổi được mật khẩu. Kiểm tra thông tin và thử lại.",
                    "Could not change password. Check your details and retry.",
                  ),
        );
        return;
      }
      setCurrent("");
      setPassword("");
      setConfirm("");
      setPasswordNotice(
        c(
          "Đã đổi mật khẩu. Các phiên đăng nhập cũ đã được đăng xuất.",
          "Password changed. Previous sessions have been signed out.",
        ),
      );
    } catch {
      setPasswordError(
        c("Mất kết nối. Vui lòng thử lại.", "Connection failed. Please retry."),
      );
    } finally {
      setChanging(false);
    }
  }
  const dirty =
    account &&
    (name !== account.user.name ||
      birth !== (account.profile.birth_date || "") ||
      major !== account.profile.major ||
      bio !== account.profile.bio);
  return (
    <div className={styles.root}>
      <header>
        <span>HAUI COMPASS</span>
        <h1>{c("Cài đặt tài khoản", "Account settings")}</h1>
      </header>
      {!account ? (
        <section className={styles.panel}>
          {error ? (
            <>
              <p role="alert">
                {error === "load_failed"
                  ? c(
                      "Chưa tải được tài khoản. Hãy thử lại.",
                      "Could not load your account. Please retry.",
                    )
                  : error}
              </p>
              <button onClick={() => setAttempt((n) => n + 1)}>
                {c("Thử lại", "Retry")}
              </button>
            </>
          ) : (
            <p role="status">{c("Đang tải…", "Loading…")}</p>
          )}
        </section>
      ) : (
        <>
          <section
            className={styles.panel}
            aria-label={c("Thông tin cá nhân", "Personal information")}
          >
            <h2>{c("Thông tin cá nhân", "Personal information")}</h2>
            <p className={styles.method}>
              {c("Đăng nhập bằng", "Signed in with")}:{" "}
              {account.login_method === "google"
                ? "Google"
                : account.user.username}
            </p>
            <AvatarSettings name={account.user.name} vi={vi} />
            <form onSubmit={save}>
              <label>
                {c("Tên hiển thị", "Display name")}
                <input
                  required
                  minLength={2}
                  maxLength={60}
                  autoComplete="name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNotice("");
                  }}
                />
              </label>
              <div className={styles.row}>
                <label>
                  {c("Ngày sinh", "Date of birth")}
                  <input
                    type="date"
                    min="1900-01-01"
                    max={new Intl.DateTimeFormat("en-CA", {
                      timeZone: "Asia/Ho_Chi_Minh",
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    }).format(new Date())}
                    autoComplete="bday"
                    value={birth}
                    onChange={(e) => setBirth(e.target.value)}
                  />
                </label>
                <label>
                  {c("Ngành học", "Field of study")}
                  <input
                    maxLength={120}
                    value={major}
                    onChange={(e) => setMajor(e.target.value)}
                  />
                </label>
              </div>
              <label>
                {c("Giới thiệu", "About you")}
                <textarea
                  maxLength={400}
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                />
              </label>

              {error && (
                <p role="alert" className={styles.error}>
                  {error}
                </p>
              )}
              {notice && (
                <p role="status" className={styles.success}>
                  {notice}
                </p>
              )}
              <button className="primary" disabled={saving || !dirty}>
                {saving
                  ? c("Đang lưu…", "Saving…")
                  : c("Lưu thay đổi", "Save changes")}
              </button>
            </form>
          </section>
          <section
            className={styles.panel}
            aria-label={c("Bảo mật tài khoản", "Account security")}
          >
            <h2>{c("Bảo mật tài khoản", "Account security")}</h2>
            {account.login_method === "google" ? (
              <>
                <p>
                  {c(
                    "Bạn đăng nhập bằng Google. Mật khẩu được quản lý trong tài khoản Google của bạn.",
                    "You sign in with Google. Manage your password in your Google account.",
                  )}
                </p>
                <a
                  className="secondary"
                  href="https://myaccount.google.com/security"
                  target="_blank"
                  rel="noreferrer"
                >
                  {c(
                    "Mở cài đặt bảo mật Google",
                    "Open Google security settings",
                  )}{" "}
                  ↗
                </a>
              </>
            ) : (
              <form onSubmit={change}>
                <label>
                  {c("Mật khẩu hiện tại", "Current password")}
                  <input
                    type="password"
                    required
                    maxLength={128}
                    autoComplete="current-password"
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                  />
                </label>
                <div className={styles.row}>
                  <label>
                    {c("Mật khẩu mới", "New password")}
                    <input
                      type="password"
                      required
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                  <label>
                    {c("Xác nhận mật khẩu mới", "Confirm new password")}
                    <input
                      type="password"
                      required
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </label>
                </div>
                <p className={styles.note}>
                  {c(
                    "Từ 8 đến 128 ký tự, khác mật khẩu hiện tại.",
                    "8–128 characters, different from your current password.",
                  )}
                </p>
                {passwordError && (
                  <p role="alert" className={styles.error}>
                    {passwordError}
                  </p>
                )}
                {passwordNotice && (
                  <p role="status" className={styles.success}>
                    {passwordNotice}
                  </p>
                )}
                <button
                  className="primary"
                  disabled={changing || !current || !password || !confirm}
                >
                  {changing
                    ? c("Đang đổi…", "Changing…")
                    : c("Đổi mật khẩu", "Change password")}
                </button>
              </form>
            )}
          </section>
        </>
      )}
    </div>
  );
}
