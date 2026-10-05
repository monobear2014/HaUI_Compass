"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type Language = "en" | "vi";
export type Theme = "light" | "dark";

type Preferences = {
  language: Language;
  setLanguage: (language: Language) => void;
  theme: Theme;
  toggleTheme: () => void;
  t: (key: string) => string;
};

const copy: Record<Language, Record<string, string>> = {
  en: {
    today: "Today",
    weeklyPlan: "Weekly Plan",
    reflect: "Reflect",
    history: "History",
    academicData: "Academic Data",
    workspace: "YOUR WORKSPACE",
    studentWorkspace: "Student workspace",
    demoWorkspace: "Demo workspace",
    fictionalData: "Fictional student · Mock LMS",
    resetsOnRestart: "Data resets when API restarts.",
    demoStudent: "HaUI · Demo student",
    demoScenario: "Demo scenario",
    selectScenario: "Select a fictional scenario",
    resetScenario: "Reset this scenario",
    scenarioNotice:
      "Fictional data · fixed demo clock · selecting or resetting clears this in-memory demo session, including imports.",
    loadingScenario: "Loading fictional scenario…",
    loadingWorkspace: "Loading your workspace…",
    unavailable: "Workspace unavailable",
    retry: "Retry",
    language: "Language",
    lightMode: "Use light mode",
    darkMode: "Use dark mode",
    skipContent: "Skip to content",
    footer: "A little clarity, a better direction.",
    learningLoop: "Learning Loop v0",
    whatNow: "What should I do now?",
    whatNowDescription: "One useful next step. Everything else in perspective.",
    refresh: "Refresh",
    nextBestAction: "YOUR NEXT BEST ACTION",
    due: "Due",
    minutesEstimated: "min estimated",
    recommendationExplanation: "Recommendation explanation",
    aiOnline: "AI · online",
    templateOffline: "Template · offline",
    decisionText:
      "The engine chooses the task and risk. This text only explains its decision.",
    decisionEvidence: "Decision evidence",
    recordWork: "Record work",
    recordWorkHint: "Make progress, then tell Compass what happened.",
    clearForNow: "You're clear for now.",
    clearForNowText:
      "There are no open tasks to recommend. Review your plan or reflect on your recent work.",
    reflectWork: "Reflect on your work",
    todaysPlan: "Today's study plan",
    viewWeek: "View week",
    freshStart: "Space for a fresh start",
    freshStartText:
      "No study blocks today. Your weekly plan keeps upcoming work visible.",
    progress: "Your progress",
    tasksCompleted: "tasks completed in this workspace",
    inProgress: "in progress",
    notStarted: "not started",
    assignmentRisk: "Assignment risk",
    riskNote:
      "Uses original task estimates and scenario capacity. Replan inputs affect the plan only.",
    comingUp: "Coming up",
    planStartingPoint: "A plan is a starting point.",
    planStartingPointText:
      "Record what you do. Reflect on what you learn. Adjust with intention.",
    makeTimeReflect: "Make time to reflect",
    rankingDimension: "Ranking deciding dimension:",
  },
  vi: {
    today: "Hôm nay",
    weeklyPlan: "Kế hoạch tuần",
    reflect: "Phản tư",
    history: "Lịch sử",
    academicData: "Dữ liệu học tập",
    workspace: "KHÔNG GIAN HỌC TẬP",
    studentWorkspace: "Không gian học tập",
    demoWorkspace: "Không gian demo",
    fictionalData: "Sinh viên giả lập · LMS mô phỏng",
    resetsOnRestart: "Dữ liệu được làm mới khi API khởi động lại.",
    demoStudent: "HaUI · Sinh viên demo",
    demoScenario: "Kịch bản demo",
    selectScenario: "Chọn một kịch bản giả lập",
    resetScenario: "Đặt lại kịch bản",
    scenarioNotice:
      "Dữ liệu giả lập · đồng hồ demo cố định · chọn hoặc đặt lại sẽ xóa phiên demo trong bộ nhớ, bao gồm cả dữ liệu import.",
    loadingScenario: "Đang tải kịch bản giả lập…",
    loadingWorkspace: "Đang tải không gian học tập…",
    unavailable: "Không thể tải không gian học tập",
    retry: "Thử lại",
    language: "Ngôn ngữ",
    lightMode: "Chuyển sang giao diện sáng",
    darkMode: "Chuyển sang giao diện tối",
    skipContent: "Bỏ qua để đến nội dung",
    footer: "Rõ ràng hơn, đi đúng hướng hơn.",
    learningLoop: "Vòng lặp học tập v0",
    whatNow: "Tôi nên làm gì ngay bây giờ?",
    whatNowDescription:
      "Một bước hữu ích tiếp theo. Mọi thứ khác trong đúng bối cảnh.",
    refresh: "Làm mới",
    nextBestAction: "HÀNH ĐỘNG TỐT NHẤT TIẾP THEO",
    due: "Hạn",
    minutesEstimated: "phút ước tính",
    recommendationExplanation: "Giải thích đề xuất",
    aiOnline: "AI · trực tuyến",
    templateOffline: "Mẫu · ngoại tuyến",
    decisionText:
      "Engine quyết định công việc và mức rủi ro. Nội dung này chỉ diễn giải quyết định đó.",
    decisionEvidence: "Bằng chứng quyết định",
    recordWork: "Ghi nhận việc học",
    recordWorkHint: "Hãy ghi lại tiến độ và điều đã xảy ra.",
    clearForNow: "Bạn đã rõ việc cần làm lúc này.",
    clearForNowText:
      "Không còn công việc mở để đề xuất. Hãy xem lại kế hoạch hoặc phản tư về việc vừa làm.",
    reflectWork: "Phản tư về việc học",
    todaysPlan: "Kế hoạch học hôm nay",
    viewWeek: "Xem tuần",
    freshStart: "Khoảng trống cho một khởi đầu mới",
    freshStartText:
      "Hôm nay chưa có phiên học. Kế hoạch tuần vẫn giữ các việc sắp tới trong tầm nhìn.",
    progress: "Tiến độ của bạn",
    tasksCompleted: "công việc đã hoàn thành trong không gian này",
    inProgress: "đang thực hiện",
    notStarted: "chưa bắt đầu",
    assignmentRisk: "Rủi ro bài tập",
    riskNote:
      "Dùng ước lượng task ban đầu và sức chứa của kịch bản. Dữ liệu replan chỉ ảnh hưởng kế hoạch.",
    comingUp: "Sắp tới",
    planStartingPoint: "Kế hoạch là một điểm bắt đầu.",
    planStartingPointText:
      "Ghi lại việc bạn làm. Phản tư về điều bạn học. Điều chỉnh có chủ đích.",
    makeTimeReflect: "Dành thời gian phản tư",
    rankingDimension: "Yếu tố xếp hạng quyết định:",
  },
};

const PreferencesContext = createContext<Preferences | null>(null);

export function PreferencesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [language, setLanguage] = useState<Language>("en");
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const storedLanguage = window.localStorage.getItem("haui-compass-language");
    const storedTheme = window.localStorage.getItem("haui-compass-theme");
    const frame = window.requestAnimationFrame(() => {
      if (storedLanguage === "en" || storedLanguage === "vi")
        setLanguage(storedLanguage);
      if (storedTheme === "light" || storedTheme === "dark")
        setTheme(storedTheme);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("haui-compass-language", language);
    window.localStorage.setItem("haui-compass-theme", theme);
  }, [language, theme]);

  return (
    <PreferencesContext.Provider
      value={{
        language,
        setLanguage,
        theme,
        toggleTheme: () =>
          setTheme((current) => (current === "light" ? "dark" : "light")),
        t: (key) => copy[language][key] || copy.en[key] || key,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("PreferencesProvider is required");
  return value;
}
