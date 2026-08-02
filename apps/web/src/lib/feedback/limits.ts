// Shared submission limits. Kept env-free and dependency-free so the client
// widget, the submit route's zod schema, and the public screenshot endpoint all
// agree on the same ceiling — a mismatch here means a submission the widget
// allows gets 400'd, or a stored screenshot the endpoint refuses to serve.
export const MAX_SCREENSHOTS = 3;

export const MAX_SCREENSHOT_INDEX = MAX_SCREENSHOTS - 1;
