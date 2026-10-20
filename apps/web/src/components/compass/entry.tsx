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
                  ? "Không gian học tập dùng bài tập LMS giả lập. Bản online lưu tài khoản, kế hoạch, tiến độ và phản tư theo tài khoản trong cơ sở dữ liệu; mật khẩu được băm và trình duyệt giữ cookie phiên. Ngôn ngữ và sáng/tối được lưu trên thiết bị. Khi bật AI trực tuyến, nội dung liên quan tới câu hỏi hoặc phản tư được gửi tới nhà cung cấp mô hình để xử lý."
                  : "The workspace uses simulated LMS assignments. The online build stores accounts, plans, progress and reflections per account in a database; passwords are hashed and the browser keeps a session cookie. Language and theme stay on your device. When online AI is enabled, relevant question or reflection context is sent to the configured model provider."}
              </p>
              <h2>{vi ? "Phiên học và tài liệu" : "Sessions and documents"}</h2>
              <p>
                {vi
                  ? "Bản trình diễn local có thể dùng bộ nhớ tạm; bản online dùng lưu trữ bền theo tài khoản. Giảng viên được cấp quyền chỉ xem số liệu tổng hợp của lớp, không xem nội dung mục tiêu, phản tư hay sở thích riêng. Hỏi đáp ghi rõ nguồn học liệu công khai và tài liệu mô phỏng."
                  : "Local showcases may use temporary memory; the online build uses durable per-account storage. Authorized lecturers see class aggregates, not private goal text, reflections or preferences. Q&A distinguishes public courseware and fictional materials."}
              </p>
              <h2>
                {vi
                  ? "Sở thích học tập do bạn xác nhận"
                  : "Your confirmed learning preferences"}
              </h2>
              <p>
                {vi
                  ? "Khung giờ học, mục tiêu thời lượng và chủ đề bạn tự thấy khó chỉ được lưu khi bạn xác nhận. Bạn có thể xem, sửa hoặc xoá tại Kế hoạch tuần → Sở thích học tập của tôi. Áp dụng vào bản nháp không tự duyệt lịch. Xoá sở thích không xoá các kế hoạch hay phản tư đã lưu; các dữ kiện đó vẫn có trong lịch sử tuần. Sở thích được giữ đến khi bạn sửa hoặc xoá, và không được chia sẻ cho dashboard giảng viên."
                  : "Study sessions, time targets and self-reported difficult topics are saved only when you confirm. View, edit or delete them in Weekly plan → My learning preferences. Applying them to a draft does not approve a schedule. Deleting preferences does not erase existing plans or reflections, which remain in weekly history. Preferences are retained until edited or deleted and are not shared with the lecturer dashboard."}
              </p>
              <h2>
                {vi
                  ? "Chatbot và memory cá nhân"
                  : "Chatbot and personal memory"}
              </h2>
              <p>
                {vi
                  ? "Hội thoại chatbot được lưu theo tài khoản; panel hiển thị 30 lượt gần nhất. Memory chỉ lưu khi bạn xác nhận, tối đa 20 mục, và được dùng cùng dữ liệu học tập liên quan để cá nhân hoá gợi ý. Bạn có thể xem, sửa, xoá từng memory hoặc xoá hội thoại tại panel phải. Xoá hội thoại không xoá memory; xoá memory không xoá nội dung đã có trong hội thoại. Dữ liệu này không hiển thị cho giảng viên. Trạng thái thu gọn menu và mở chatbot chỉ lưu trên thiết bị."
                  : "Chatbot exchanges are stored per account; the panel shows the 30 most recent exchanges. Memory is saved only after your confirmation, up to 20 items, and used with relevant learning context to personalize advice. View, edit or delete memories, or clear conversation history, in the right panel. Clearing history keeps memories; deleting a memory keeps its previously recorded conversation text. Lecturers cannot see this data. Menu and chatbot layout preferences stay on your device."}
              </p>
              <h2>
                {vi
                  ? "Hồ sơ và bảo mật tài khoản"
                  : "Profile and account security"}
              </h2>
              <p>
                {vi
                  ? "Tên hiển thị, ngày sinh tuỳ chọn, ngành học và giới thiệu được lưu theo tài khoản tại Cài đặt tài khoản; bạn có thể sửa hoặc xoá các trường tuỳ chọn. Hồ sơ này không được gửi tới AI hoặc dashboard giảng viên. Đổi mật khẩu riêng yêu cầu mật khẩu hiện tại và thu hồi các phiên cũ. Tài khoản Google quản lý mật khẩu tại Google."
                  : "Display name, optional birth date, field of study and biography are stored per account in Account settings; optional fields can be edited or cleared. This profile is not sent to AI or the lecturer dashboard. Changing a local password requires the current password and revokes previous sessions. Google accounts manage passwords at Google."}
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
                  ? "Đây là bản đồ án có đăng nhập và dữ liệu học tập giả lập riêng theo tài khoản, chưa đồng bộ Canvas thật. AI là gợi ý để xem lại, không tự thực hiện thay bạn. Tính năng mô hình trực tuyến phụ thuộc cấu hình; bản demo có phương án mẫu ngoại tuyến được gắn nhãn."
                  : "This graduation-project build has sign-in and account-owned simulated learning data, without actual Canvas synchronization. AI suggestions require review. Online features depend on configuration; offline templates are labelled."}
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
