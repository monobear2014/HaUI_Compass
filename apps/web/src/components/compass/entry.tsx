"use client";

import Link from "next/link";
import { usePreferences } from "../preferences";
import { content } from "./content";
import { CIcon, CompassLogo, CompassPreferences } from "./primitives";
import styles from "./compass.module.css";

export function CompassDemoStart() {
  const { language, theme } = usePreferences();
  const vi = language === "vi";
  const c = content[language];
  const screens = [
    {
      href: "/today",
      icon: "clock",
      title: vi ? "Việc hôm nay" : "Today's work",
      body: vi
        ? "Biết việc nên làm tiếp theo, xem rủi ro deadline và lý do ưu tiên."
        : "Know what to do next, with deadline risk and reasons for each priority.",
      action: vi ? "Bắt đầu tại đây" : "Start here",
    },
    {
      href: "/plan",
      icon: "plan",
      title: vi ? "Kế hoạch tuần" : "Weekly plan",
      body: vi
        ? "Xếp lịch theo khung giờ rảnh và xem thay đổi khi cần điều chỉnh."
        : "Plan around your available time and review changes when replanning.",
      action: vi ? "Xem kế hoạch" : "Explore the plan",
    },
    {
      href: "/academic",
      icon: "book",
      title: vi ? "Môn học & bài tập" : "Courses & assignments",
      body: vi
        ? "Thêm môn học, assignment và xem gợi ý AI chia nhỏ công việc."
        : "Add courses and assignments, then review an AI task breakdown.",
      action: vi ? "Quản lý bài tập" : "Manage assignments",
    },
  ];
  return (
    <main className={`${styles.page} ${styles.entryPage}`} data-theme={theme}>
      <div className={styles.entryContainer}>
        <div className={styles.entryTop}>
          <CompassLogo />
          <CompassPreferences />
        </div>
        <div className={styles.roleHeading}>
          <span className={styles.sourcePill}>
            <CIcon name="spark" size={12} />
            {c.sandbox}
          </span>
          <h1>
            {vi ? "Bạn muốn bắt đầu từ đâu?" : "Where would you like to begin?"}
          </h1>
          <p>
            {vi
              ? "Chọn một màn hình để khám phá. Đăng nhập bằng tài khoản demo / haui123 nếu bạn chưa đăng nhập."
              : "Choose a screen to explore. Sign in with demo / haui123 if you have not signed in."}
          </p>
        </div>
        <div className={styles.roles}>
          {screens.map((screen) => (
            <Link
              key={screen.href}
              className={styles.roleCard}
              href={screen.href}
            >
              <span className={styles.iconTile}>
                <CIcon name={screen.icon} size={23} />
              </span>
              <h2>{screen.title}</h2>
              <p>{screen.body}</p>
              <span className={styles.blueButton}>
                {screen.action}
                <CIcon name="arrow" size={15} />
              </span>
            </Link>
          ))}
        </div>
        <p className={styles.entryFooter}>
          {vi ? "Muốn hỏi tài liệu?" : "Need an answer from your materials?"}{" "}
          <Link href="/knowledge">
            {vi ? "Mở hỏi đáp có trích dẫn" : "Open source-cited Q&A"}
          </Link>
        </p>
        <p className={styles.entryFooter}>
          {vi
            ? "Các kịch bản tuần bình thường, cận deadline và thay đổi lịch có thể chọn trong không gian học tập. Chọn hoặc đặt lại kịch bản sẽ làm mới phiên demo."
            : "Choose Normal Week, Deadline Crunch or Disrupted Week inside the workspace. Selecting or resetting a scenario clears the demo session."}
        </p>
      </div>
    </main>
  );
}

export function CompassInfoPage({
  kind,
}: {
  kind: "privacy" | "terms" | "access" | "forgot" | "login";
}) {
  const { language, theme } = usePreferences();
  const c = content[language];
  const vi = language === "vi";
  const title =
    kind === "privacy"
      ? c.privacyLink
      : kind === "terms"
        ? c.termsLink
        : kind === "access"
          ? c.accessLink
          : vi
            ? "Truy cập bản demo"
            : "Access the demo";
  return (
    <main className={`${styles.page} ${styles.entryPage}`} data-theme={theme}>
      <div className={styles.entryContainer}>
        <div className={styles.entryTop}>
          <CompassLogo />
          <CompassPreferences />
        </div>
        <article className={styles.legalContainer}>
          <span className={styles.sourcePill}>{c.sandbox}</span>
          <h1>{title}</h1>
          {kind === "privacy" ? (
            <>
              <h2>{vi ? "Dữ liệu trong bản demo" : "Data in this demo"}</h2>
              <p>
                {vi
                  ? "Không gian học tập sử dụng dữ liệu giả lập. Ngôn ngữ và sáng/tối được lưu trên thiết bị. Tài khoản và mật khẩu đã băm được lưu cục bộ trên máy chủ demo; trình duyệt giữ cookie phiên đăng nhập. Dữ liệu học tập bạn nhập được gửi tới API HaUI Compass của bản chạy này."
                  : "The workspace uses fictional learning data. Preferences stay on your device. Accounts and password hashes are stored locally on the demo server; the browser keeps a session cookie. Learning inputs are sent to this build's HaUI Compass API."}
              </p>
              <h2>{vi ? "Phiên học và tài liệu" : "Sessions and documents"}</h2>
              <p>
                {vi
                  ? "Kịch bản demo dùng bộ nhớ tạm. Đặt lại kịch bản hoặc khởi động lại API làm mới dữ liệu. Chỉ nhập dữ liệu giả lập hoặc dữ liệu bạn được phép dùng; không nhập thông tin cá nhân nhạy cảm. Hỏi đáp phân biệt tài liệu môn học demo và nguồn công khai HaUI bằng nhãn nguồn."
                  : "Demo scenarios use temporary memory. Resetting a scenario or restarting the API clears its data. Only enter fictional or authorized data, not sensitive personal information. Q&A labels fictional course materials separately from public HaUI sources."}
              </p>
            </>
          ) : kind === "terms" ? (
            <>
              <h2>{vi ? "Chức năng đang có" : "Available learning flows"}</h2>
              <p>
                {vi
                  ? "Quản lý dữ liệu học tập, gợi ý việc tiếp theo, đánh giá rủi ro deadline, kế hoạch tuần, ghi nhận thực hiện, phản hồi và điều chỉnh kế hoạch. AI hỗ trợ chia nhỏ assignment, giải thích gợi ý và hỏi đáp tài liệu có trích dẫn."
                  : "Academic-data management, next-action suggestions, deadline risk, weekly planning, execution recording, reflection and replanning. AI supports assignment breakdown, suggestion explanations and cited document Q&A."}
              </p>
              <h2>{vi ? "Giới hạn cần biết" : "Current boundaries"}</h2>
              <p>
                {vi
                  ? "Đây là bản đồ án có đăng nhập và đăng ký cục bộ, dùng chung dữ liệu học tập giả lập, chưa đồng bộ LMS. AI là gợi ý để xem lại, không tự thực hiện thay bạn. Tính năng mô hình trực tuyến phụ thuộc cấu hình; bản demo có phương án mẫu ngoại tuyến được gắn nhãn."
                  : "This graduation-project build has local sign-in and registration, with shared fictional learning data and no LMS synchronization. AI suggestions require review. Online features depend on configuration; offline templates are labelled."}
              </p>
            </>
          ) : kind === "access" ? (
            <>
              <h2>
                {vi
                  ? "Một la bàn cho tuần học của bạn"
                  : "A compass for your study week"}
              </h2>
              <p>
                {vi
                  ? "HaUI Compass là đồ án tốt nghiệp về hỗ trợ học tập thích ứng dành cho sinh viên. Sản phẩm xoay quanh chu trình Lên kế hoạch — Thực hiện — Phản hồi — Điều chỉnh, với mỗi màn hình tập trung vào một quyết định học tập."
                  : "HaUI Compass is a graduation project exploring adaptive learning support for students. It follows a Plan — Do — Reflect — Adapt loop, with one main learning decision per screen."}
              </p>
              <p>
                {vi
                  ? "Đây không phải cổng thông tin sinh viên chính thức của HaUI. Môn học và bài tập trong bộ demo là hư cấu; nguồn công khai HaUI trong hỏi đáp được ghi rõ xuất xứ."
                  : "This is not an official HaUI student portal. Demo courses and assignments are fictional; public HaUI sources in Q&A show their provenance."}
              </p>
            </>
          ) : (
            <p>
              {vi
                ? "Dùng tài khoản demo / haui123 để đăng nhập. Bản demo không gửi email khôi phục mật khẩu; không dùng thông tin đăng nhập thật."
                : "Sign in with demo / haui123. This demo does not send password recovery emails; do not use real credentials."}
            </p>
          )}
          <div className={styles.heroActions}>
            <Link className={styles.blueButton} href="/today">
              {c.build}
              <CIcon name="arrow" size={16} />
            </Link>
            <Link href="/">{c.back}</Link>
          </div>
        </article>
      </div>
    </main>
  );
}
