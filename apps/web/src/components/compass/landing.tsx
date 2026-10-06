"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePreferences } from "../preferences";
import { content } from "./content";
import {
  CIcon,
  CompassLogo,
  CompassMark,
  CompassPreferences,
} from "./primitives";
import { CitedPreview, ProductPreview, StepPreview } from "./previews";
import styles from "./compass.module.css";

const sections = [
  "home",
  "product",
  "how-it-works",
  "deadlines",
  "ai-support",
  "try-it",
];
const productIcons = ["clock", "plan", "reflect", "spark", "chat"];
const stepIcons = ["book", "clock", "plan", "check", "reflect", "arrow"];

export function CompassLanding() {
  const { language, theme } = usePreferences();
  const c = content[language];
  const [product, setProduct] = useState(0);
  const [step, setStep] = useState(0);
  const [active, setActive] = useState("home");
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [faq, setFaq] = useState<number | null>(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatQuestion, setChatQuestion] = useState<number | null>(null);
  const stepElements = useRef<Array<HTMLLIElement | null>>([]);
  const productTabs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
          if (entry.target.id === "home") setScrolled(!entry.isIntersecting);
        }
      },
      { rootMargin: "-72px 0px -55% 0px", threshold: 0 },
    );
    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting)
            setStep(Number((entry.target as HTMLElement).dataset.step));
      },
      { rootMargin: "-30% 0px -40% 0px", threshold: 0 },
    );
    stepElements.current.forEach((el) => {
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  function selectTab(index: number) {
    setProduct(index);
    productTabs.current[index]?.focus();
  }

  return (
    <div className={styles.page} data-theme={theme}>
      <a href="#main-content" className={styles.skip}>
        Skip to main content
      </a>
      <header
        className={`${styles.header} ${scrolled ? styles.headerScrolled : ""}`}
      >
        <div className={styles.headerInner}>
          <CompassLogo />
          <nav
            className={`${styles.nav} ${menuOpen ? styles.navOpen : ""}`}
            aria-label="Main navigation"
          >
            {sections.map((id, i) => (
              <a
                key={id}
                href={`#${id}`}
                className={active === id ? styles.navActive : ""}
                aria-current={active === id ? "location" : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {c.nav[i]}
              </a>
            ))}
          </nav>
          <div className={styles.headerActions}>
            <CompassPreferences />
            <Link className={styles.signIn} href="/login">
              {c.signIn}
            </Link>
            <Link className={styles.tryButton} href="/today">
              {c.try}
            </Link>
            <button
              className={styles.menuButton}
              aria-expanded={menuOpen}
              aria-label="Toggle navigation"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <CIcon name={menuOpen ? "close" : "menu"} />
            </button>
          </div>
        </div>
      </header>

      <main id="main-content">
        <section id="home" className={styles.hero}>
          <Image
            className={styles.heroVideo}
            src="/compass/study-hero.png"
            alt=""
            fill
            sizes="100vw"
            priority
          />
          <div className={styles.heroShade} />
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <span className={styles.heroBadge}>
                <i />
                {c.badge}
              </span>
              <h1>
                {c.title}
                <span>{c.cycle}</span>
              </h1>
              <p>{c.intro}</p>
              <div className={styles.heroActions}>
                <Link href="/today" className={styles.blueButton}>
                  {c.build}
                  <CIcon name="arrow" size={18} />
                </Link>
                <a href="#how-it-works" className={styles.heroSecondary}>
                  {c.see}
                </a>
              </div>
              <ul className={styles.heroPromises}>
                {c.promises.map((text, i) => (
                  <li key={text}>
                    <CIcon name={["shield", "file", "eye"][i]} size={15} />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className={styles.proofStrip} aria-label="Product principles">
          <div>
            {c.proof.map((text, i) => (
              <p key={text}>
                <CIcon name={["file", "quote", "users"][i]} size={20} />
                {text}
              </p>
            ))}
          </div>
        </section>

        <section
          id="product"
          className={`${styles.section} ${styles.mutedSection}`}
        >
          <div className={styles.productContainer}>
            <span className={styles.eyebrow}>{c.productLabel}</span>
            <h2 className={styles.productHeading}>{c.productTitle}</h2>
            <p className={styles.description}>{c.productDescription}</p>
            <div className={styles.productGrid}>
              <div
                className={styles.productTabs}
                role="tablist"
                aria-label={c.productLabel}
                aria-orientation="vertical"
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    selectTab((product + (e.key === "ArrowDown" ? 1 : 4)) % 5);
                  }
                  if (e.key === "Home" || e.key === "End") {
                    e.preventDefault();
                    selectTab(e.key === "Home" ? 0 : 4);
                  }
                }}
              >
                {c.products.map(([title, description], i) => (
                  <button
                    key={i}
                    ref={(el) => {
                      productTabs.current[i] = el;
                    }}
                    id={`product-tab-${i}`}
                    role="tab"
                    tabIndex={product === i ? 0 : -1}
                    aria-selected={product === i}
                    aria-controls="product-canvas-panel"
                    className={product === i ? styles.productSelected : ""}
                    onClick={() => setProduct(i)}
                  >
                    <CIcon name={productIcons[i]} size={20} />
                    <span>
                      <strong>{title}</strong>
                      <small>{description}</small>
                    </span>
                  </button>
                ))}
              </div>
              <div
                role="tabpanel"
                id="product-canvas-panel"
                aria-labelledby={`product-tab-${product}`}
              >
                <ProductPreview index={product} />
                <Link
                  className={styles.previewLink}
                  href={
                    ["/today", "/plan", "/reflect", "/academic", "/knowledge"][
                      product
                    ]
                  }
                >
                  {language === "vi" ? "Mở màn hình này" : "Open this screen"}
                  <CIcon name="arrow" size={16} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          className={`${styles.section} ${styles.gridSection}`}
        >
          <div className={styles.container}>
            <span className={`${styles.eyebrow} ${styles.blueEyebrow}`}>
              <i />
              {c.howLabel}
            </span>
            <h2>{c.howTitle}</h2>
            <p className={styles.description}>{c.howDescription}</p>
            <div className={styles.stepsGrid}>
              <ol className={styles.steps}>
                {c.steps.map(([title, description], i) => (
                  <li
                    key={i}
                    data-step={i}
                    ref={(el) => {
                      stepElements.current[i] = el;
                    }}
                    className={step === i ? styles.stepActive : ""}
                  >
                    <span className={styles.stepDot}>
                      <CIcon name={stepIcons[i]} size={18} />
                    </span>
                    <div>
                      <small>{i + 1} / 6</small>
                      <h3>{title}</h3>
                      <p>{description}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className={styles.stickyPreview}>
                <StepPreview index={step} />
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.container}>
            <span className={styles.eyebrow}>{c.pillarsLabel}</span>
            <h2 className={styles.pillarsHeading}>{c.pillarsTitle}</h2>
            <div className={styles.pillars}>
              {c.pillars.map(([title, body], i) => (
                <article key={i} className={i === 0 ? styles.pillarQa : ""}>
                  <div>
                    <span className={styles.iconTile}>
                      <CIcon name={["chat", "users", "shield"][i]} size={19} />
                    </span>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                  {i === 0 ? (
                    <div className={styles.pillarPreview}>
                      <CitedPreview compact />
                    </div>
                  ) : i === 1 ? (
                    <div className={styles.pillarChart}>
                      <div>
                        {[40, 65, 55, 82, 70, 91].map((height, j) => (
                          <span key={j} style={{ height: `${height}%` }} />
                        ))}
                      </div>
                      <small>
                        {language === "vi"
                          ? "Ví dụ minh họa · tiến độ qua các tuần"
                          : "Illustrative example · progress over the weeks"}
                      </small>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          id="grounded"
          className={`${styles.section} ${styles.groundedSection}`}
        >
          <div className={`${styles.container} ${styles.splitGrid}`}>
            <div>
              <span className={styles.eyebrow}>
                {language === "vi"
                  ? "HỎI ĐÁP CÓ TRÍCH DẪN"
                  : "SOURCE-CITED Q&A"}
              </span>
              <h2>{c.groundedTitle}</h2>
              <p>{c.groundedBody}</p>
              <p>{c.groundedExtra}</p>
            </div>
            <div className={styles.darkCitation}>
              <span className={styles.eyebrow}>{c.citationLabel}</span>
              <CitedPreview compact={false} />
              <div className={styles.abstainBox}>
                <strong>{c.noEvidence}</strong>
                <p>{c.abstain}</p>
              </div>
            </div>
          </div>
        </section>

        <section id="deadlines" className={styles.section}>
          <div className={styles.container}>
            <span className={styles.eyebrow}>{c.deadlineLabel}</span>
            <h2>{c.deadlineTitle}</h2>
            <p className={styles.description}>{c.deadlineBody}</p>
            <div className={styles.deadlineGrid}>
              <div className={styles.studentEvidence}>
                <div className={styles.evidenceStudent}>
                  <strong>
                    {language === "vi"
                      ? "BÀI TẬP CẦN CHÚ Ý · MINH HỌA"
                      : "ASSIGNMENT TO WATCH · EXAMPLE"}
                  </strong>
                </div>
                <ul>
                  <li>
                    <span>{c.missed.split(":")[0]}:</span>
                    <strong>{c.missed.split(":")[1]}</strong>
                  </li>
                  <li>
                    <span>{c.notStarted.split(":")[0]}:</span>
                    <strong>{c.notStarted.split(":")[1]}</strong>
                  </li>
                  <li>
                    <CIcon name="reflect" />
                    {c.declining}
                  </li>
                </ul>
                <p>{c.signal}</p>
              </div>
              <div className={styles.evidenceConnector}>
                <CIcon name="arrow" size={18} />
              </div>
              <div className={styles.deadlineCard}>
                <div className={styles.previewMeta}>
                  <span>
                    {language === "vi" ? "RỦI RO DEADLINE" : "DEADLINE RISK"}
                  </span>
                  <span className={styles.warningPill}>
                    {language === "vi" ? "Cần chú ý" : "Needs attention"}
                  </span>
                </div>
                <p className={styles.highRiskText}>
                  {language === "vi"
                    ? "Ưu tiên bước tiếp theo"
                    : "Prioritize the next step"}
                </p>
                <Link className={styles.outlineButton} href="/today">
                  <CIcon name="shield" size={14} />
                  {c.review}
                </Link>
              </div>
            </div>
            <p className={styles.deadlineNote}>
              <i />
              {c.deadlineNote}
            </p>
          </div>
        </section>

        <section
          id="ai-support"
          className={`${styles.section} ${styles.mutedSection}`}
        >
          <div className={`${styles.container} ${styles.splitGrid}`}>
            <div>
              <span className={styles.eyebrow}>{c.integrityLabel}</span>
              <h2>{c.integrityTitle}</h2>
              <p>{c.integrityBody}</p>
            </div>
            <div>
              <div className={styles.guardSteps}>
                {c.guardSteps.map((text, i) => (
                  <span key={i}>
                    <span>
                      <CIcon
                        name={["chat", "eye", "shield", "chat"][i]}
                        size={14}
                      />
                      {text}
                    </span>
                    {i < 3 && <CIcon name="arrow" size={13} />}
                  </span>
                ))}
              </div>
              <div className={styles.integrityQuestion}>
                &quot;{c.guardQuestion}&quot;
              </div>
              <p className={styles.integrityAnswer}>{c.guardAnswer}</p>
              <Link className={styles.previewLink} href="/academic">
                {language === "vi"
                  ? "Chia nhỏ bài tập của bạn"
                  : "Break down your assignment"}
                <CIcon name="arrow" size={16} />
              </Link>
            </div>
          </div>
        </section>

        <section className={styles.proofStrip} aria-label="Privacy principles">
          <div>
            {c.privacy.map((text, i) => (
              <p key={text}>
                <CIcon name={["check", "users", "shield"][i]} size={22} />
                {text}
              </p>
            ))}
          </div>
        </section>

        <section id="faq" className={`${styles.section} ${styles.faqSection}`}>
          <div className={styles.faqContainer}>
            <h2>{c.faqTitle}</h2>
            <p className={styles.description}>{c.faqDescription}</p>
            <div className={styles.faqList}>
              {c.faqs.map(([question, answer], i) => (
                <article key={i}>
                  <h3>
                    <button
                      aria-expanded={faq === i}
                      aria-controls={`faq-panel-${i}`}
                      onClick={() => setFaq(faq === i ? null : i)}
                    >
                      {question}
                      <span aria-hidden="true">{faq === i ? "−" : "+"}</span>
                    </button>
                  </h3>
                  <div id={`faq-panel-${i}`} hidden={faq !== i}>
                    <p>{answer}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="try-it" className={styles.ctaSection}>
          <div className={styles.ctaCard}>
            <span className={styles.heroBadge}>
              <i />
              {language === "vi"
                ? "KẾ HOẠCH · THỰC HIỆN · THÍCH ỨNG"
                : "PLAN · DO · REFLECT · ADAPT"}
            </span>
            <h2>{c.ctaTitle}</h2>
            <p>{c.ctaDescription}</p>
            <div className={styles.heroActions}>
              <Link className={styles.blueButton} href="/today">
                {c.try}
                <CIcon name="arrow" size={18} />
              </Link>
              <Link href="/demo" className={styles.ctaLink}>
                {c.reviewHow}
                <CIcon name="arrow" size={16} />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <div>
            <CompassLogo />
            <p>
              {language === "vi"
                ? "Rõ ràng hơn, đi đúng hướng hơn."
                : "A little clarity, a better direction."}
            </p>
          </div>
          <nav aria-label="Footer navigation">
            {[1, 2, 4, 3, 5].map((i) => (
              <a key={i} href={`#${sections[i]}`}>
                {c.nav[i]}
              </a>
            ))}
          </nav>
          <div className={styles.footerContact}>
            <span className={styles.eyebrow}>{c.contact}</span>
            <span>
              {language === "vi"
                ? "Hỗ trợ học tập thích ứng cho sinh viên"
                : "Adaptive learning support for students"}
            </span>
            <span>
              {language === "vi"
                ? "Đồ án tốt nghiệp · Bản trình diễn"
                : "Graduation project · Demonstration build"}
            </span>
            <Link href="/request-access">{c.accessLink}</Link>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <span>
            © 2026 HaUI Compass ·{" "}
            {language === "vi"
              ? "Dữ liệu demo, không phải cổng thông tin chính thức của HaUI."
              : "Demo data; not an official HaUI student portal."}
          </span>
          <div>
            <Link href="/privacy">{c.privacyLink}</Link>
            <Link href="/terms">{c.termsLink}</Link>
            <Link href="/request-access">{c.accessLink}</Link>
          </div>
        </div>
      </footer>

      <div className={styles.chatDock}>
        <button
          className={styles.chatLabel}
          onClick={() => setChatOpen(!chatOpen)}
        >
          {c.ask}
        </button>
        <button
          className={styles.mascotButton}
          aria-label="Open the HaUI Compass guide"
          aria-expanded={chatOpen}
          onClick={() => setChatOpen(!chatOpen)}
        >
          <CompassMark size={36} />
          <span />
        </button>
      </div>
      {chatOpen && (
        <aside className={styles.chatPanel} aria-label="HaUI Compass guide">
          <div className={styles.chatHeader}>
            <CompassMark size={32} />
            <div>
              <strong>HaUI Compass</strong>
              <small>
                {language === "vi" ? "Tìm hiểu sản phẩm" : "Product guide"}
              </small>
            </div>
            <button aria-label="Close chat" onClick={() => setChatOpen(false)}>
              <CIcon name="close" size={18} />
            </button>
          </div>
          <div className={styles.chatBody}>
            <p>
              {language === "vi"
                ? "Chào bạn. Bạn muốn tìm hiểu điều gì về HaUI Compass? Đây là hướng dẫn bản demo, không phải hội thoại AI."
                : "Hello. What would you like to know about HaUI Compass? This is a demo guide, not an AI conversation."}
            </p>
            {c.faqs.slice(1, 5).map(([question], i) => (
              <button key={i} onClick={() => setChatQuestion(i + 1)}>
                {question}
              </button>
            ))}
            {chatQuestion !== null && (
              <div aria-live="polite" className={styles.chatAnswer}>
                {c.faqs[chatQuestion][1]}
              </div>
            )}
            <Link className={styles.blueButton} href="/knowledge">
              {language === "vi"
                ? "Hỏi đáp tài liệu môn học"
                : "Ask course documents"}
              <CIcon name="arrow" size={15} />
            </Link>
          </div>
        </aside>
      )}
      {scrolled && (
        <a className={styles.backToTop} href="#home" aria-label="Back to top">
          <CIcon name="up" size={20} />
        </a>
      )}
    </div>
  );
}
