export type Language = "en" | "vi";

export type Translation = {
  nav: {
    today: string;
    plan: string;
    reflect: string;
    history: string;
    academic: string;
    knowledge: string;
    statistics: string;
    studySet: string;
    workspace: string;
    studentWorkspace: string;
  };
  common: {
    refresh: string;
    retry: string;
    cancel: string;
    close: string;
    save: string;
    saving: string;
    loading: string;
    minutes: string;
    due: string;
    start: string;
    end: string;
    remove: string;
    current: string;
    before: string;
    after: string;
    yes: string;
    no: string;
    noDeadline: string;
    error: string;
    selectScenario: string;
    demoScenario: string;
    resetScenario: string;
    demoNotice: string;
    fictionalData: string;
    resetsOnRestart: string;
    loadingScenario: string;
    loadingWorkspace: string;
    unavailable: string;
    language: string;
    lightMode: string;
    darkMode: string;
    skipContent: string;
    footer: string;
    demoWorkspace: string;
    demoStudent: string;
    demo: string;
    hanoiTime: string;
    task: string;
    studySession: string;
    minUnplanned: string;
  };
  today: {
    eyebrow: string;
    title: string;
    description: string;
    nextBestAction: string;
    doStep: string;
    risk: string;
    riskHigh: string;
    riskMedium: string;
    riskLow: string;
    riskUnknown: string;
    estimated: string;
    explanation: string;
    online: string;
    offline: string;
    decisionText: string;
    evidence: string;
    ranking: string;
    recordWork: string;
    recordWorkHint: string;
    clearForNow: string;
    clearForNowText: string;
    reflectWork: string;
    todaysPlan: string;
    viewWeek: string;
    freshStart: string;
    freshStartText: string;
    progress: string;
    tasksCompleted: string;
    inProgress: string;
    notStarted: string;
    assignmentRisk: string;
    riskNote: string;
    comingUp: string;
    planStartingPoint: string;
    planStartingPointText: string;
    makeTimeReflect: string;
    tasksCompletedLabel: string;
    needsAttention: string;
    allFits: string;
  };
  execution: {
    title: string;
    startedAt: string;
    deviceTimezone: string;
    endedAt: string;
    outcome: string;
    partial: string;
    completed: string;
    save: string;
    saving: string;
    note: string;
    close: string;
  };
  plan: {
    eyebrow: string;
    title: string;
    description: string;
    closeEditor: string;
    adjust: string;
    generate: string;
    revision: string;
    blocks: string;
    planned: string;
    attention: string;
    planner: string;
    blankTitle: string;
    blankText: string;
    adjustTitle: string;
    createTitle: string;
    explicitInputs: string;
    availability: string;
    remaining: string;
    remainingHint: string;
    removeWindow: string;
    createRevision: string;
    generateWeekly: string;
    updated: string;
    noScheduled: string;
    baselineUnavailable: string;
    preserved: string;
    exactMatches: string;
    reflectionInfo: string;
    backendReasons: string;
    readOnly: string;
    studyBlocks: string;
    unplanned: string;
  };
  reflection: {
    eyebrow: string;
    title: string;
    description: string;
    yourReflection: string;
    stepOne: string;
    stepTwo: string;
    whatWorkedOn: string;
    selectTasks: string;
    workload: string;
    difficultTopics: string;
    topicsPlaceholder: string;
    commaHint: string;
    deferred: string;
    deferredHint: string;
    review: string;
    reviewing: string;
    candidates: string;
    proposalsHint: string;
    factual: string;
    selfReported: string;
    noSignals: string;
    noSignalsText: string;
    saveConfirmed: string;
    saving: string;
    unselected: string;
    insightsHere: string;
    insightsHereText: string;
    confirmed: string;
    estimation: string;
    workloadFelt: string;
    difficultTopic: string;
    deferredTask: string;
    tooLight: string;
    appropriate: string;
    tooHeavy: string;
  };
  history: {
    eyebrow: string;
    title: string;
    description: string;
    revisions: string;
    revision: string;
    initial: string;
    adaptive: string;
    viewPlan: string;
    storyTitle: string;
    storyText: string;
    goToPlan: string;
    note: string;
  };
  academic: {
    eyebrow: string;
    title: string;
    description: string;
    current: string;
    academicToTasks: string;
    currentHint: string;
    deadline: string;
    confirmedTasks: string;
    noConfirmedTasks: string;
    todayLink: string;
    manual: string;
    courseName: string;
    courseCode: string;
    assignmentTitle: string;
    deviceDeadline: string;
    estimate: string;
    estimateHint: string;
    importManual: string;
    fileImport: string;
    fileHint: string;
    fileLabel: string;
    selected: string;
    validateImport: string;
    serverValidates: string;
    importedData: string;
    provenance: string;
    courses: string;
    assignments: string;
    submissions: string;
    sourceManual: string;
    sourceCsv: string;
    sourceJson: string;
    clearSource: string;
    noImported: string;
    suggest: string;
    suggesting: string;
    candidates: string;
    suggestionsHint: string;
    include: string;
    suggestedTitle: string;
    suggestedEstimate: string;
    addSelected: string;
    addingSelected: string;
    added: string;
    createTask: string;
    studyTaskTitle: string;
    studyTaskEstimate: string;
    saveTask: string;
    cancel: string;
    online: string;
    offline: string;
    manualImported: string;
    fileImported: string;
    taskCreated: string;
    dataCleared: string;
  };
};

const en: Translation = {
  nav: {
    today: "Today",
    plan: "Weekly Plan",
    reflect: "After studying",
    history: "Plan history",
    academic: "Assignments",
    knowledge: "Ask documents",
    statistics: "Overview",
    studySet: "Study set",
    workspace: "YOUR WORKSPACE",
    studentWorkspace: "Student workspace",
  },
  common: {
    refresh: "Refresh",
    retry: "Retry",
    cancel: "Cancel",
    close: "Close",
    save: "Save",
    saving: "Saving…",
    loading: "Loading…",
    minutes: "min",
    due: "Due",
    start: "Start",
    end: "End",
    remove: "Remove window",
    current: "CURRENT",
    before: "BEFORE",
    after: "AFTER",
    yes: "Yes",
    no: "No",
    noDeadline: "No deadline",
    error: "Error",
    selectScenario: "Select a fictional scenario",
    demoScenario: "Demo scenario",
    resetScenario: "Reset this scenario",
    demoNotice:
      "Fictional data · fixed demo clock · selecting or resetting clears this in-memory demo session, including imports.",
    fictionalData: "Fictional student · Mock LMS",
    resetsOnRestart: "Data resets when API restarts.",
    loadingScenario: "Loading fictional scenario…",
    loadingWorkspace: "Loading your workspace…",
    unavailable: "Workspace unavailable",
    language: "Language",
    lightMode: "Use light mode",
    darkMode: "Use dark mode",
    skipContent: "Skip to content",
    footer: "A little clarity, a better direction.",
    demoWorkspace: "Demo workspace",
    demoStudent: "HaUI · Demo student",
    demo: "DEMO",
    hanoiTime: "Times in Hanoi (UTC+07)",
    task: "Task",
    studySession: "Study session",
    minUnplanned: "min unplanned",
  },
  today: {
    eyebrow: "TODAY",
    title: "What should I do now?",
    description: "One useful next step. Everything else in perspective.",
    nextBestAction: "YOUR NEXT BEST ACTION",
    doStep: "SUGGESTED",
    risk: "RISK",
    riskHigh: "HIGH",
    riskMedium: "MEDIUM",
    riskLow: "LOW",
    riskUnknown: "UNKNOWN",
    estimated: "min estimated",
    explanation: "Why this task?",
    online: "AI · online",
    offline: "Template · offline",
    decisionText:
      "The engine chooses the task and risk. This text only explains its decision.",
    evidence: "Decision evidence",
    ranking: "Ranking deciding dimension:",
    recordWork: "Record work",
    recordWorkHint: "Make progress, then tell HaUI Compass what happened.",
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
    tasksCompletedLabel: "Tasks completed",
    needsAttention: "Needs attention",
    allFits: "All requested work fits in your study windows.",
  },
  execution: {
    title: "Record your work",
    startedAt: "Started at",
    deviceTimezone: "your device timezone",
    endedAt: "Ended at",
    outcome: "What was the outcome?",
    partial: "Made progress · not finished",
    completed: "Completed the task",
    save: "Save execution",
    saving: "Saving…",
    note: "Only record work you actually did. Execution time does not automatically reduce remaining effort.",
    close: "Close record work",
  },
  plan: {
    eyebrow: "PLAN · MAKE ROOM FOR WHAT MATTERS",
    title: "Your weekly plan.",
    description: "See when to study. Adjust when your availability changes.",
    closeEditor: "Close editor",
    adjust: "Adjust & replan",
    generate: "Generate plan",
    revision: "Revision",
    blocks: "study blocks",
    planned: "planned",
    attention: "need attention",
    planner: "Planner",
    blankTitle: "Your week is a blank page",
    blankText: "Choose your study windows to generate an initial plan.",
    adjustTitle: "Adjust your next steps",
    createTitle: "Create your first plan",
    explicitInputs: "EXPLICIT INPUTS",
    availability:
      "Enter your availability in your device timezone. The schedule displays Hanoi time.",
    remaining: "Work still remaining",
    remainingHint:
      "Update how many minutes each task still needs. These defaults are original estimates.",
    removeWindow: "Remove study window",
    createRevision: "Create revised plan",
    generateWeekly: "Generate weekly plan",
    updated: "Plan updated",
    noScheduled: "No scheduled work",
    baselineUnavailable: "Baseline unavailable",
    preserved: "Blocks kept unchanged",
    exactMatches: "Exact block matches between the saved snapshots.",
    reflectionInfo:
      "Confirmed reflection is included as informational context; it does not change placement in v0.",
    backendReasons: "Changes are explained by the backend's typed reasons.",
    readOnly:
      "Your plan is read-only. Adjust study windows and remaining effort to create an auditable new revision.",
    studyBlocks: "study blocks",
    unplanned: "unplanned",
  },
  reflection: {
    eyebrow: "AFTER STUDYING",
    title: "How did your study session go?",
    description: "Review what you studied, then choose the notes to keep.",
    yourReflection: "Your study session",
    stepOne: "STEP 1 OF 2",
    stepTwo: "STEP 2 OF 2",
    whatWorkedOn: "What did you work on?",
    selectTasks: "Select the tasks you want to reflect on.",
    workload: "How did the workload feel?",
    difficultTopics: "Topics that felt difficult",
    topicsPlaceholder: "e.g. Normalization, gradient descent",
    commaHint: "Separate topics with commas.",
    deferred: "Tasks you intentionally deferred",
    deferredHint: "Your own account, not an inferred behavior.",
    review: "Review my notes",
    reviewing: "Reviewing…",
    candidates: "Choose what to remember",
    proposalsHint: "Only the notes you select will be saved.",
    factual: "FROM RECORDED WORK",
    selfReported: "YOUR FEEDBACK",
    noSignals: "No signals to review",
    noSignalsText: "Add task feedback, workload feedback or difficult topics.",
    saveConfirmed: "Save selected notes",
    saving: "Saving…",
    unselected: "Not selected? Not saved. You can edit and review again.",
    insightsHere: "Your insights will appear here",
    insightsHereText:
      "Review your reflection to see factual comparisons and self-reported signals. Nothing is confirmed automatically.",
    confirmed: "Your selected reflection signals were confirmed and saved.",
    estimation: "estimated",
    workloadFelt: "Workload felt",
    difficultTopic: "Difficult topic",
    deferredTask: "Intentionally deferred",
    tooLight: "Too light",
    appropriate: "About right",
    tooHeavy: "Too heavy",
  },
  history: {
    eyebrow: "SAVED PLANS",
    title: "Your saved plans.",
    description: "Open a previous version to see what was scheduled.",
    revisions: "revisions",
    revision: "Revision",
    initial: "Initial weekly plan",
    adaptive: "Adaptive replan",
    viewPlan: "View plan",
    storyTitle: "Your story starts with a plan",
    storyText: "Create a weekly plan and your revisions will be kept here.",
    goToPlan: "Go to Weekly Plan",
    note: "Past schedules are snapshots. Task status shown alongside them reflects your current workspace.",
  },
  academic: {
    eyebrow: "ACADEMIC DATA",
    title: "Your courses & assignments.",
    description: "Keep assignments and deadlines in one place.",
    current: "Current imported data",
    academicToTasks: "Your assignments",
    currentHint:
      "Three fictional courses. AI decomposition creates editable candidates; only your confirmation creates study tasks.",
    deadline: "Deadline",
    confirmedTasks: "Confirmed study tasks",
    noConfirmedTasks: "No confirmed study tasks yet.",
    todayLink: "Today → Risk & next action",
    manual: "Manual entry",
    courseName: "Course name",
    courseCode: "Course code",
    assignmentTitle: "Assignment title",
    deviceDeadline: "Deadline (your device timezone)",
    estimate: "Planning estimate (minutes)",
    estimateHint: "This is your focused-study estimate, not an LMS value.",
    importManual: "Import manual data",
    fileImport: "CSV or JSON import",
    fileHint:
      "Choose a fictional or authorized academic-data file. Only .csv and .json are accepted.",
    fileLabel: "Academic data file",
    selected: "Selected",
    validateImport: "Validate and import",
    serverValidates: "The server validates the full file before committing it.",
    importedData: "Assignments you added",
    provenance: "Provenance",
    courses: "courses",
    assignments: "assignments",
    submissions: "submissions",
    sourceManual: "Manual",
    sourceCsv: "CSV",
    sourceJson: "JSON",
    clearSource: "Clear this imported source",
    noImported: "No imported data for this source yet.",
    suggest: "Break into steps",
    suggesting: "Generating suggestions…",
    candidates: "Candidate study tasks",
    suggestionsHint:
      "Edit the titles and estimates, then add only the steps you need.",
    include: "Include this candidate",
    suggestedTitle: "Suggested task title",
    suggestedEstimate: "Suggested estimate (minutes)",
    addSelected: "Add selected tasks",
    addingSelected: "Adding selected tasks…",
    added: "Added",
    createTask: "Create study task",
    studyTaskTitle: "Study task title",
    studyTaskEstimate: "Study task estimate (minutes)",
    saveTask: "Save study task",
    cancel: "Cancel",
    online: "AI · online",
    offline: "Template · offline",
    manualImported:
      "Manual academic data imported. It is your planning input, not LMS data.",
    fileImported:
      "Academic data imported. Server validation accepted the complete dataset.",
    taskCreated:
      "Study task created. It can now be used by the existing planning loop.",
    dataCleared: "Imported data cleared. Existing study tasks are protected.",
  },
};

const vi: Translation = {
  nav: {
    today: "Hôm nay",
    plan: "Kế hoạch tuần",
    reflect: "Sau buổi học",
    history: "Lịch sử kế hoạch",
    academic: "Môn học & bài tập",
    knowledge: "Hỏi tài liệu",
    statistics: "Tổng quan",
    studySet: "Bộ học tập",
    workspace: "KHÔNG GIAN HỌC TẬP",
    studentWorkspace: "Không gian học tập",
  },
  common: {
    refresh: "Làm mới",
    retry: "Thử lại",
    cancel: "Hủy",
    close: "Đóng",
    save: "Lưu",
    saving: "Đang lưu…",
    loading: "Đang tải…",
    minutes: "phút",
    due: "Hạn",
    start: "Bắt đầu",
    end: "Kết thúc",
    remove: "Xóa khung giờ",
    current: "HIỆN TẠI",
    before: "TRƯỚC",
    after: "SAU",
    yes: "Có",
    no: "Không",
    noDeadline: "Không có hạn",
    error: "Lỗi",
    selectScenario: "Chọn một kịch bản giả lập",
    demoScenario: "Kịch bản demo",
    resetScenario: "Đặt lại kịch bản",
    demoNotice:
      "Dữ liệu giả lập · đồng hồ demo cố định · chọn hoặc đặt lại sẽ xóa phiên demo trong bộ nhớ, bao gồm cả dữ liệu import.",
    fictionalData: "Sinh viên giả lập · LMS mô phỏng",
    resetsOnRestart: "Dữ liệu được làm mới khi API khởi động lại.",
    loadingScenario: "Đang tải kịch bản giả lập…",
    loadingWorkspace: "Đang tải không gian học tập…",
    unavailable: "Không thể tải không gian học tập",
    language: "Ngôn ngữ",
    lightMode: "Chuyển sang giao diện sáng",
    darkMode: "Chuyển sang giao diện tối",
    skipContent: "Bỏ qua để đến nội dung",
    footer: "Rõ ràng hơn, đi đúng hướng hơn.",
    demoWorkspace: "Không gian demo",
    demoStudent: "HaUI · Sinh viên demo",
    demo: "DEMO",
    hanoiTime: "Giờ Hà Nội (UTC+07)",
    task: "Công việc",
    studySession: "Phiên học",
    minUnplanned: "phút chưa xếp lịch",
  },
  today: {
    eyebrow: "HÔM NAY",
    title: "Tôi nên làm gì ngay bây giờ?",
    description:
      "Một bước hữu ích tiếp theo. Mọi thứ khác trong đúng bối cảnh.",
    nextBestAction: "VIỆC NÊN LÀM",
    doStep: "GỢI Ý",
    risk: "RỦI RO",
    riskHigh: "CAO",
    riskMedium: "TRUNG BÌNH",
    riskLow: "THẤP",
    riskUnknown: "CHƯA BIẾT",
    estimated: "ước tính",
    explanation: "Vì sao gợi ý việc này?",
    online: "AI · trực tuyến",
    offline: "Mẫu · ngoại tuyến",
    decisionText:
      "Thứ tự ưu tiên và mức rủi ro được tính riêng; nội dung AI chỉ giải thích kết quả.",
    evidence: "Bằng chứng quyết định",
    ranking: "Yếu tố xếp hạng quyết định:",
    recordWork: "Ghi nhận buổi học",
    recordWorkHint: "Ghi lại sau khi bạn đã học.",
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
    tasksCompletedLabel: "Công việc đã hoàn thành",
    needsAttention: "Cần chú ý",
    allFits: "Tất cả công việc yêu cầu đều vừa với các khung giờ học.",
  },
  execution: {
    title: "Ghi nhận việc học",
    startedAt: "Bắt đầu lúc",
    deviceTimezone: "theo múi giờ thiết bị",
    endedAt: "Kết thúc lúc",
    outcome: "Kết quả là gì?",
    partial: "Đã tiến bộ · chưa hoàn thành",
    completed: "Đã hoàn thành công việc",
    save: "Lưu phiên học",
    saving: "Đang lưu…",
    note: "Chỉ ghi nhận việc bạn thực sự đã làm. Thời lượng không tự động trừ vào phần việc còn lại.",
    close: "Đóng hộp thoại ghi nhận",
  },
  plan: {
    eyebrow: "KẾ HOẠCH · DÀNH CHỖ CHO ĐIỀU QUAN TRỌNG",
    title: "Kế hoạch tuần của bạn.",
    description: "Biết khi nào nên học. Điều chỉnh nếu lịch rảnh thay đổi.",
    closeEditor: "Đóng trình chỉnh sửa",
    adjust: "Điều chỉnh lịch",
    generate: "Tạo kế hoạch",
    revision: "Bản sửa đổi",
    blocks: "khung học",
    planned: "đã lên lịch",
    attention: "cần chú ý",
    planner: "Planner",
    blankTitle: "Chưa có lịch học tuần này",
    blankText: "Thêm thời gian rảnh để xếp lịch cho các bài tập.",
    adjustTitle: "Điều chỉnh bước tiếp theo",
    createTitle: "Tạo kế hoạch đầu tiên",
    explicitInputs: "DỮ LIỆU BẠN NHẬP",
    availability:
      "Nhập thời gian rảnh theo múi giờ thiết bị. Lịch sẽ hiển thị theo giờ Hà Nội.",
    remaining: "Phần việc còn lại",
    remainingHint:
      "Cập nhật số phút cần thêm cho mỗi việc. Giá trị gợi ý là ước lượng ban đầu.",
    removeWindow: "Xóa khung giờ học",
    createRevision: "Tạo kế hoạch sửa đổi",
    generateWeekly: "Tạo kế hoạch tuần",
    updated: "Đã cập nhật kế hoạch",
    noScheduled: "Chưa có việc được xếp lịch",
    baselineUnavailable: "Không có kế hoạch gốc",
    preserved: "Khung giờ được giữ nguyên",
    exactMatches: "Các khung giờ trùng khớp giữa hai bản kế hoạch đã lưu.",
    reflectionInfo:
      "Phản tư đã xác nhận chỉ được đưa vào làm bối cảnh; trong v0 chưa thay đổi vị trí công việc.",
    backendReasons:
      "Các thay đổi được giải thích bằng lý do có kiểu từ backend.",
    readOnly:
      "Kế hoạch chỉ xem. Điều chỉnh khung giờ và phần việc còn lại để tạo bản sửa đổi có thể kiểm tra.",
    studyBlocks: "khung học",
    unplanned: "chưa xếp",
  },
  reflection: {
    eyebrow: "SAU BUỔI HỌC",
    title: "Buổi học vừa rồi thế nào?",
    description: "Nhìn lại việc vừa học, rồi chọn điều muốn ghi nhớ.",
    yourReflection: "Phản hồi của bạn",
    stepOne: "BƯỚC 1 / 2",
    stepTwo: "BƯỚC 2 / 2",
    whatWorkedOn: "Bạn đã làm những việc nào?",
    selectTasks: "Chọn các công việc bạn muốn nhìn lại.",
    workload: "Khối lượng công việc vừa rồi thế nào?",
    difficultTopics: "Chủ đề khiến bạn thấy khó",
    topicsPlaceholder: "ví dụ: Chuẩn hóa dữ liệu, gradient descent",
    commaHint: "Ngăn cách các chủ đề bằng dấu phẩy.",
    deferred: "Công việc bạn đã chủ động hoãn",
    deferredHint:
      "Đây là điều bạn tự ghi nhận, không phải hành vi được suy đoán.",
    review: "Xem lại phản hồi",
    reviewing: "Đang xem lại…",
    candidates: "Chọn điều muốn ghi nhớ",
    proposalsHint: "Chỉ những điều bạn chọn mới được lưu.",
    factual: "TỪ VIỆC ĐÃ GHI NHẬN",
    selfReported: "BẠN TỰ CHIA SẺ",
    noSignals: "Không có tín hiệu để xem",
    noSignalsText:
      "Hãy thêm phản hồi về công việc, khối lượng hoặc chủ đề khó.",
    saveConfirmed: "Lưu điều đã chọn",
    saving: "Đang lưu…",
    unselected: "Điều chưa chọn sẽ không lưu. Bạn có thể sửa và xem lại.",
    insightsHere: "Insight của bạn sẽ xuất hiện ở đây",
    insightsHereText:
      "Xem lại phản tư để thấy so sánh dựa trên dữ kiện và tín hiệu tự báo cáo. Không có gì được tự động xác nhận.",
    confirmed: "Các tín hiệu phản tư bạn chọn đã được xác nhận và lưu.",
    estimation: "ước tính",
    workloadFelt: "Khối lượng cảm nhận là",
    difficultTopic: "Chủ đề khó",
    deferredTask: "Đã chủ động hoãn",
    tooLight: "Quá nhẹ",
    appropriate: "Vừa phải",
    tooHeavy: "Quá nặng",
  },
  history: {
    eyebrow: "KẾ HOẠCH ĐÃ LƯU",
    title: "Lịch sử kế hoạch.",
    description: "Mở một bản đã lưu để xem lại lịch học khi đó.",
    revisions: "bản sửa đổi",
    revision: "Bản sửa đổi",
    initial: "Kế hoạch tuần ban đầu",
    adaptive: "Lập lại kế hoạch thích ứng",
    viewPlan: "Xem kế hoạch",
    storyTitle: "Câu chuyện của bạn bắt đầu từ một kế hoạch",
    storyText: "Tạo kế hoạch tuần và các bản sửa đổi sẽ được lưu ở đây.",
    goToPlan: "Đến Kế hoạch tuần",
    note: "Lịch cũ là các ảnh chụp tại thời điểm đó. Trạng thái công việc hiển thị cạnh lịch phản ánh không gian hiện tại.",
  },
  academic: {
    eyebrow: "DỮ LIỆU HỌC TẬP",
    title: "Môn học & bài tập.",
    description: "Giữ bài tập và hạn nộp ở một nơi.",
    current: "Dữ liệu đang import",
    academicToTasks: "Bài tập của bạn",
    currentHint:
      "Ba học phần giả lập. AI tạo các đề xuất có thể chỉnh sửa; chỉ thao tác xác nhận của bạn mới tạo công việc học.",
    deadline: "Hạn",
    confirmedTasks: "Công việc học đã xác nhận",
    noConfirmedTasks: "Chưa chia thành công việc",
    todayLink: "Hôm nay → Rủi ro & việc tiếp theo",
    manual: "Nhập tay",
    courseName: "Tên học phần",
    courseCode: "Mã học phần",
    assignmentTitle: "Tên bài tập",
    deviceDeadline: "Hạn (theo múi giờ thiết bị)",
    estimate: "Ước lượng để lập kế hoạch (phút)",
    estimateHint:
      "Đây là ước lượng thời gian học tập trung của bạn, không phải giá trị từ LMS.",
    importManual: "Thêm bài tập",
    fileImport: "Thêm từ file",
    fileHint:
      "Chọn file dữ liệu học tập giả lập hoặc được cấp quyền. Chỉ nhận .csv và .json.",
    fileLabel: "File dữ liệu học tập",
    selected: "Đã chọn",
    validateImport: "Thêm từ file",
    serverValidates: "Server sẽ kiểm tra toàn bộ file trước khi ghi dữ liệu.",
    importedData: "Bài tập bạn đã thêm",
    provenance: "Nguồn dữ liệu",
    courses: "học phần",
    assignments: "bài tập",
    submissions: "lần nộp",
    sourceManual: "Thủ công",
    sourceCsv: "CSV",
    sourceJson: "JSON",
    clearSource: "Xóa nguồn dữ liệu này",
    noImported: "Chưa có dữ liệu import cho nguồn này.",
    suggest: "Chia thành bước nhỏ",
    suggesting: "Đang tạo gợi ý…",
    candidates: "Công việc học được đề xuất",
    suggestionsHint: "Sửa tên và thời lượng, rồi thêm những bước bạn cần.",
    include: "Đưa đề xuất này vào",
    suggestedTitle: "Tên công việc đề xuất",
    suggestedEstimate: "Thời lượng đề xuất (phút)",
    addSelected: "Thêm công việc đã chọn",
    addingSelected: "Đang thêm công việc…",
    added: "Đã thêm",
    createTask: "Tạo công việc học",
    studyTaskTitle: "Tên công việc học",
    studyTaskEstimate: "Ước lượng công việc học (phút)",
    saveTask: "Lưu công việc học",
    cancel: "Hủy",
    online: "AI · trực tuyến",
    offline: "Mẫu · ngoại tuyến",
    manualImported:
      "Đã import dữ liệu học tập thủ công. Đây là dữ liệu đầu vào để lập kế hoạch, không phải dữ liệu LMS.",
    fileImported:
      "Đã import dữ liệu học tập. Server đã kiểm tra toàn bộ dataset.",
    taskCreated:
      "Đã tạo công việc học. Công việc này có thể được dùng trong vòng lặp lập kế hoạch.",
    dataCleared:
      "Đã xóa dữ liệu import. Các công việc học hiện có vẫn được bảo vệ.",
  },
};

export const translations: Record<Language, Translation> = { en, vi };
export type TranslationKey = {
  [
    Group in keyof Translation & string
  ]: `${Group}.${keyof Translation[Group] & string}`;
}[keyof Translation & string];
