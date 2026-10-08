"use client";

import Link from "next/link";
import { useState } from "react";
import { usePreferences } from "../preferences";
import {
  CIcon,
  CompassLogo,
  CompassMark,
  CompassPreferences,
} from "./primitives";
import { AuthStudyScene } from "./auth-scene";
import styles from "./compass.module.css";
import auth from "./auth.module.css";

export function CompassAuth({
  mode,
  nextPath,
}: {
  mode: "login" | "register";
  nextPath: string;
}) {
  const { language, theme } = usePreferences();
  const vi = language === "vi";
  const registering = mode === "register";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [detailsStep, setDetailsStep] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const messages: Record<string, string> = {
    invalid_input: vi
      ? "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại."
      : "Invalid input. Please check your details.",
    invalid_origin: vi
      ? "Yêu cầu không hợp lệ. Hãy tải lại trang và thử lại."
      : "Request rejected. Reload this page and try again.",
    invalid_credentials: vi
      ? "Tên đăng nhập hoặc mật khẩu chưa đúng."
      : "Incorrect username or password.",
    username_taken: vi
      ? "Tên này đã có tài khoản. Hãy đăng nhập hoặc chọn tên khác."
      : "This username is taken. Sign in or choose another.",
    invalid_registration: vi
      ? "Kiểm tra lại thông tin: tên đăng nhập 3–32 ký tự, mật khẩu từ 6 ký tự."
      : "Check your details: username 3–32 characters, password at least 6 characters.",
    too_many_attempts: vi
      ? "Bạn đã thử sai nhiều lần. Vui lòng thử lại sau một phút."
      : "Too many failed attempts. Try again in one minute.",
    mismatch: vi ? "Hai mật khẩu chưa khớp." : "Passwords do not match.",
    unavailable: vi
      ? "Chưa thể kết nối. Thông tin bạn nhập vẫn được giữ để thử lại."
      : "Unable to connect. Your input is kept so you can retry.",
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (registering && !detailsStep) {
      setDetailsStep(true);
      return;
    }
    if (registering && password !== confirmation) {
      setError("mismatch");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          ...(registering ? { name } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "unavailable");
        setBusy(false);
        return;
      }
      // A new document also discards any stale, pre-authenticated router cache.
      window.location.assign(
        `/onboarding?next=${encodeURIComponent(nextPath)}`,
      );
    } catch {
      setError("unavailable");
      setBusy(false);
    }
  }

  const alternate = `${registering ? "/login" : "/register"}?next=${encodeURIComponent(nextPath)}`;
  const showDetails = !registering || detailsStep;
  return (
    <main className={`${styles.page} ${auth.page}`} data-theme={theme}>
      <header className={auth.header}>
        <CompassLogo />
        <CompassPreferences />
      </header>
      <section
        className={auth.left}
        aria-label={vi ? "Tài khoản HaUI Compass" : "HaUI Compass account"}
      >
        <div className={auth.content}>
          <h1>
            {registering
              ? vi
                ? "Tạo tài khoản của bạn"
                : "Create your account"
              : vi
                ? "Chào mừng bạn trở lại."
                : "Welcome back."}
          </h1>
          <section
            className={auth.card}
            aria-label={
              registering
                ? vi
                  ? "Đăng ký"
                  : "Register"
                : vi
                  ? "Đăng nhập"
                  : "Sign in"
            }
          >
            {registering ? (
              <Link
                className={auth.demoButton}
                href={`/login?next=${encodeURIComponent(nextPath)}`}
              >
                <CompassMark size={22} />
                {vi
                  ? "Dùng tài khoản demo có sẵn"
                  : "Use the existing demo account"}
              </Link>
            ) : (
              <button
                className={auth.demoButton}
                type="button"
                disabled={busy}
                onClick={() => {
                  setUsername("demo");
                  setPassword("haui123");
                  setError("");
                }}
              >
                <CompassMark size={22} />
                {vi ? "Điền tài khoản demo" : "Fill demo account"}
              </button>
            )}
            <div className={auth.divider}>
              <span>{vi ? "hoặc" : "or"}</span>
            </div>
            <form
              onSubmit={submit}
              className={auth.form}
              onChange={() => setError("")}
            >
              <label htmlFor="auth-username">
                {vi ? "Tên đăng nhập" : "Username"}
              </label>
              <div className={auth.inputIcon}>
                <CIcon name="users" size={16} />
                <input
                  id="auth-username"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  minLength={registering ? 3 : undefined}
                  maxLength={32}
                  pattern={registering ? "[a-zA-Z0-9_.\\-]{3,32}" : undefined}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={
                    vi ? "Nhập tên đăng nhập" : "Enter your username"
                  }
                  aria-describedby={registering ? "username-help" : undefined}
                />
              </div>
              {registering && (
                <small id="username-help">
                  {vi
                    ? "3–32 ký tự: chữ không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới."
                    : "3–32 characters: letters, numbers, dots, hyphens or underscores."}
                </small>
              )}
              {registering && detailsStep && (
                <label className={auth.field}>
                  {vi ? "Tên hiển thị" : "Display name"}
                  <input
                    required
                    minLength={2}
                    maxLength={60}
                    autoComplete="nickname"
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={
                      vi ? "Ví dụ: Sinh viên HaUI" : "e.g. HaUI student"
                    }
                  />
                </label>
              )}
              {showDetails && (
                <div className={auth.field}>
                  <label htmlFor="auth-password">
                    {vi ? "Mật khẩu" : "Password"}
                  </label>
                  <div className={auth.password}>
                    <input
                      id="auth-password"
                      required
                      type={showPassword ? "text" : "password"}
                      minLength={registering ? 6 : undefined}
                      maxLength={128}
                      autoComplete={
                        registering ? "new-password" : "current-password"
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        registering
                          ? vi
                            ? "Ít nhất 6 ký tự"
                            : "At least 6 characters"
                          : vi
                            ? "Nhập mật khẩu"
                            : "Enter your password"
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-pressed={showPassword}
                      aria-label={
                        showPassword
                          ? vi
                            ? "Ẩn mật khẩu"
                            : "Hide password"
                          : vi
                            ? "Hiện mật khẩu"
                            : "Show password"
                      }
                    >
                      <CIcon name="eye" size={18} />
                    </button>
                  </div>
                </div>
              )}
              {registering && detailsStep && (
                <label className={auth.field}>
                  {vi ? "Nhập lại mật khẩu" : "Confirm password"}
                  <input
                    required
                    type={showPassword ? "text" : "password"}
                    maxLength={128}
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </label>
              )}
              {error && (
                <p className={auth.error} role="alert">
                  {messages[error] || messages.unavailable}
                </p>
              )}
              <button type="submit" className={auth.submit} disabled={busy}>
                {busy
                  ? vi
                    ? "Đang xử lý…"
                    : "Please wait…"
                  : registering
                    ? detailsStep
                      ? vi
                        ? "Tạo tài khoản"
                        : "Create account"
                      : vi
                        ? "Tiếp tục"
                        : "Continue"
                    : vi
                      ? "Đăng nhập"
                      : "Sign in"}
                <CIcon name="arrow" size={16} />
              </button>
              {registering && detailsStep && (
                <button
                  className={auth.previous}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setDetailsStep(false);
                    setError("");
                  }}
                >
                  {vi ? "Quay lại" : "Go back"}
                </button>
              )}
            </form>
            <p className={auth.legal}>
              {vi
                ? "Tiếp tục sử dụng đồng nghĩa bạn đồng ý với "
                : "By continuing, you agree to our "}
              <Link href="/terms">{vi ? "Điều khoản" : "Terms"}</Link>
              {vi ? " và " : " and "}
              <Link href="/privacy">
                {vi ? "Chính sách dữ liệu" : "Data & privacy"}
              </Link>
              .
            </p>
            <p className={auth.alternate}>
              {registering
                ? vi
                  ? "Đã có tài khoản?"
                  : "Already have an account?"
                : vi
                  ? "Chưa có tài khoản?"
                  : "New here?"}{" "}
              <Link href={alternate}>
                {registering
                  ? vi
                    ? "Đăng nhập"
                    : "Sign in"
                  : vi
                    ? "Đăng ký"
                    : "Register"}
              </Link>
            </p>
          </section>
          <details className={auth.demoNote}>
            <summary>
              DEMO · <code>demo / haui123</code>
            </summary>
            <p>
              {vi
                ? "Các tài khoản dùng chung dữ liệu học tập giả lập. Chỉ dùng tên và mật khẩu thử nghiệm, không dùng mật khẩu thật."
                : "Accounts share fictional learning data. Use a test name and password, not your real credentials."}
            </p>
          </details>
        </div>
      </section>
      <aside
        className={auth.right}
        aria-label={
          vi
            ? "Đồng hành cùng tuần học của bạn"
            : "A companion for your study week"
        }
      >
        <h2>
          <mark>{vi ? "Rõ việc hôm nay," : "A clearer today,"}</mark>{" "}
          {vi ? "chủ động cả tuần học." : "a calmer study week."}
        </h2>
        <div className={auth.scene}>
          <AuthStudyScene vi={vi} />
        </div>
        <h3>
          {vi ? (
            <>
              Thêm bài tập và thời gian rảnh,
              <br />
              để HaUI Compass giúp bạn lên kế hoạch.
            </>
          ) : (
            <>
              Bring your assignments and free time.
              <br />
              HaUI Compass helps you make a plan.
            </>
          )}
        </h3>
        <p className={auth.caption}>
          {vi
            ? "Một không gian học tập dành cho sinh viên"
            : "One study space, built around students"}
        </p>
        <div className={auth.pillars}>
          <span>
            <CIcon name="plan" size={24} />
            {vi ? "Lên kế hoạch" : "Plan"}
          </span>
          <span>
            <CIcon name="check" size={24} />
            {vi ? "Thực hiện" : "Do"}
          </span>
          <span>
            <CIcon name="reflect" size={24} />
            {vi ? "Điều chỉnh" : "Adapt"}
          </span>
        </div>
        <p className={auth.project}>
          HaUI Compass ·{" "}
          {vi
            ? "Đồ án tốt nghiệp · Dữ liệu demo"
            : "Graduation project · Demo data"}
        </p>
      </aside>
    </main>
  );
}
