export type BackgroundTaskContext = {
  operation: string;
  caseId?: string;
  specialistId?: string;
};

export type BackgroundTaskFailureHandler = (
  error: unknown,
  context: BackgroundTaskContext,
) => void;

/**
 * Start a detached task with a terminal rejection boundary.
 * The handler is intentionally synchronous; even a logging failure is contained
 * so a secondary error cannot become an unhandled promise rejection.
 */
export function launchBackgroundTask(
  task: Promise<unknown>,
  context: BackgroundTaskContext,
  onFailure: BackgroundTaskFailureHandler,
): void {
  void task.catch((error: unknown) => {
    try {
      onFailure(error, context);
    } catch {
      // A logging/telemetry failure must not escape this terminal boundary.
    }
  });
}
