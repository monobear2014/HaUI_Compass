import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";

// Never forward Playwright errors, stdout, stderr, request logs or attachments.
// Test titles and step titles in the release suite are fixed synthetic labels.
export default class ReleaseReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult) {
    const failedStep = (steps: TestResult["steps"]): string | undefined => {
      for (const step of steps) {
        if (step.error && step.category === "test.step") return step.title;
        const child = failedStep(step.steps);
        if (child) return child;
      }
    };
    console.log(
      JSON.stringify({
        project: test.parent.project()?.name,
        test: test.title,
        status: result.status,
        durationMs: result.duration,
        failedStep: failedStep(result.steps),
        // Line numbers permit debugging without exposing error text or values.
        failureLine: result.errors[0]?.location?.line,
      }),
    );
  }
  onError() {
    console.log('{"release":"runner-error","result":"BLOCKED"}');
  }
  onEnd(result: { status: string }) {
    console.log(JSON.stringify({ release: result.status }));
  }
}
