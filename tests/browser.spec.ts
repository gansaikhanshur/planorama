import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

test("human review survives reload and sends object-linked feedback to the waiting agent", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "A safer, simpler workspace invite flow",
    }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("overview.png"),
    fullPage: true,
  });

  await expect(page.locator(".decision-card")).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Key decisions" })
    .click();
  await page.locator(".decision-card").first().click();
  const inspector = page.getByRole("complementary", {
    name: "Object inspector",
  });
  await expect(
    inspector.getByRole("heading", { name: "Make invite links single-use" }),
  ).toBeVisible();
  await inspector
    .getByText("Alternatives considered", { exact: false })
    .click();
  await expect(
    inspector.getByText("Signed JWT invitations", { exact: true }),
  ).toBeVisible();
  await inspector.getByText("View source", { exact: false }).click();
  await expect(inspector.locator("pre")).toContainText("72 hours");
  await inspector.getByRole("button", { name: "Change", exact: true }).click();
  await inspector
    .getByRole("textbox", { name: "What should change?" })
    .fill("Please justify the 72-hour expiry for enterprise onboarding.");
  await inspector.getByRole("button", { name: "Request change" }).click();
  await expect(
    inspector.getByText(
      "Please justify the 72-hour expiry for enterprise onboarding.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("inspector.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Draft saved on this machine",
  );
  await page
    .getByRole("button", { name: "Review details", exact: true })
    .first()
    .click();
  const details = page.getByRole("dialog", { name: "Review details" });
  const currentSession = await (await page.request.get("/api/session")).json();
  await expect(
    details.getByText(currentSession.outputDir, { exact: true }),
  ).toBeVisible();
  await expect(
    details.getByRole("textbox", { name: "Message to resume review" }),
  ).toHaveValue(
    `Use Planorama to resume my saved review from this session file: ${currentSession.sessionPath}`,
  );
  await details.getByText("Restart from a terminal", { exact: true }).click();
  await expect(details.locator(".session-command")).toContainText("--session");
  await expect(details.locator(".session-command")).toContainText("4319");
  await page.screenshot({
    path: testInfo.outputPath("review-details.png"),
    fullPage: false,
  });
  await details.getByRole("button", { name: "Close review details" }).click();
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Your review" })
    .click();
  await expect(
    page.getByText(
      "Please justify the 72-hour expiry for enterprise onboarding.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator(".assessment.change_requested")).toBeVisible();

  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Diagrams" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Invitation delivery architecture" }),
  ).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(3);
  await page.locator('.react-flow__node[data-id="component-outbox"]').click();
  await expect(
    inspector.getByRole("heading", { name: "Email outbox" }),
  ).toBeVisible();
  await inspector
    .getByRole("button", { name: "Question", exact: true })
    .click();
  await inspector
    .getByRole("textbox", { name: "What would you like clarified?" })
    .fill("Is outbox retention specified?");
  await inspector.getByRole("button", { name: "Add question" }).click();
  await page.screenshot({
    path: testInfo.outputPath("architecture.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close inspector" }).click();
  await page
    .getByRole("combobox", { name: "Diagram view" })
    .selectOption("relationships");
  await expect(page.locator(".react-flow__node")).toHaveCount(10);
  await expect(page.locator(".react-flow__edge")).toHaveCount(10);
  await page.screenshot({
    path: testInfo.outputPath("map.png"),
    fullPage: true,
  });
  await page.locator('.react-flow__node[data-id="step-api"]').click();
  await expect(
    inspector.getByRole("heading", {
      name: "Build creation and acceptance endpoints",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close inspector" }).click();

  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Assumptions & risks" })
    .click();
  await expect(page.locator(".attention-row")).toHaveCount(3);
  await expect(page.locator(".decision-card")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("risks.png"),
    fullPage: true,
  });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Proposed files" })
    .click();
  await page
    .getByRole("textbox", { name: "Search plan objects" })
    .fill("invite-dialog");
  await expect(page.locator(".file-row")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Build the admin invite experience" })
    .click();
  await expect(
    inspector.getByRole("heading", {
      name: "Build the admin invite experience",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close inspector" }).click();

  await page.getByRole("button", { name: "Finish review" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Approve entire plan" }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Add an overall note", exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  const waiter = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/wait.ts",
      "--session",
      currentSession.sessionPath,
      "--timeout",
      "20",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  let waitError = "";
  waiter.stdout.on("data", (chunk) => {
    output += chunk;
  });
  waiter.stderr.on("data", (chunk) => {
    waitError += chunk;
  });
  const completed = new Promise<number | null>((resolve) =>
    waiter.on("exit", resolve),
  );
  let downloaded = false;
  page.on("download", () => {
    downloaded = true;
  });
  try {
    await expect(
      dialog.getByText("Your agent is waiting.", { exact: false }),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("send-feedback.png") });
    await dialog
      .getByRole("button", { name: "Request revision", exact: true })
      .click();
    expect(await completed, waitError).toBe(0);
    await expect(page.getByRole("status")).toContainText(
      "Your revision request and notes have been sent to the agent.",
    );
    expect(downloaded).toBe(false);
  } finally {
    waiter.kill();
  }
  const result = JSON.parse(output.trim());
  expect(result.status).toBe("review_finished");
  expect(result.review.assessments["decision-tokens"]).toBe("change_requested");
  const exported = result.feedback;
  expect(exported).toContain("[decision-tokens]");
  expect(exported).toContain("[component-outbox]");
  expect(exported).toContain("Is outbox retention specified?");
  expect(exported).toContain("Please justify the 72-hour expiry");
  expect(exported).toContain("Disposition: request_changes");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Done", exact: true })
    .click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download a copy" }).click();
  const download = await downloadPromise;
  expect(await readFile((await download.path())!, "utf8")).toBe(exported);

  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("combobox", { name: "Review section" })
    .selectOption("overview");
  await expect(
    page.getByRole("heading", {
      name: "A safer, simpler workspace invite flow",
    }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator(".decision-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Start review", exact: true }).click();
  await page.locator(".decision-card").first().click();
  await expect(inspector).toBeVisible();
  await page.getByRole("button", { name: "Close inspector" }).click();
  expect(errors).toEqual([]);
});

test("local mutation endpoint rejects cross-origin and malformed reviews", async ({
  request,
}) => {
  const crossOrigin = await request.post("/api/review", {
    headers: { origin: "https://unrelated.example" },
    data: {},
  });
  expect(crossOrigin.status()).toBe(403);
  const missingOrigin = await request.post("/api/review", { data: {} });
  expect(missingOrigin.status()).toBe(403);
  const session = await (await request.get("/api/session")).json();
  const invalid = await request.post("/api/review", {
    headers: { origin: "http://127.0.0.1:4319" },
    data: {
      expectedUpdatedAt: session.review.updatedAt,
      review: { ...session.review, assessments: { nonexistent: "accepted" } },
    },
  });
  expect(invalid.status()).toBe(409);
  expect((await invalid.json()).error).toContain("unknown plan object");
  const emptyRevision = await request.post("/api/review", {
    headers: { origin: "http://127.0.0.1:4319" },
    data: {
      expectedUpdatedAt: session.review.updatedAt,
      finalize: true,
      review: {
        ...session.review,
        assessments: {},
        comments: [],
        overallNote: "  ",
        disposition: "request_changes",
      },
    },
  });
  expect(emptyRevision.status()).toBe(409);
  expect((await emptyRevision.json()).error).toContain(
    "what you would like revised",
  );
  expect(
    (await (await request.get("/api/session")).json()).review.updatedAt,
  ).toBe(session.review.updatedAt);
});

test("short windows keep navigation scrollable and section changes return to the top", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1100, height: 480 });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Plan views" });
  const sidebar = page.locator(".sidebar");
  const headerTop = await page
    .locator(".sidebar-header")
    .evaluate((el) => el.getBoundingClientRect().top);
  expect(await nav.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );

  // Actual wheel input must scroll the menu, without scrolling the document.
  await nav.hover();
  await page.mouse.wheel(0, 900);
  await expect
    .poll(() => nav.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await expect(nav.getByRole("button", { name: "Your review" })).toBeInViewport(
    { ratio: 1 },
  );
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await nav.getByRole("button", { name: "Proposed files" }).click();
  await expect(
    page.getByRole("heading", { name: "Proposed files", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("short-window-files.png"),
    fullPage: false,
  });

  // Main-page scrolling must leave the sidebar header and navigation reachable.
  await page.locator(".file-row").first().hover();
  await page.mouse.wheel(0, 1200);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  expect(
    await page
      .locator(".sidebar-header")
      .evaluate((el) => el.getBoundingClientRect().top),
  ).toBeCloseTo(headerTop, 0);
  await nav.getByRole("button", { name: "Key decisions" }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(
    page.getByRole("heading", { name: "Key decisions", exact: true }),
  ).toBeInViewport({ ratio: 1 });

  // Keyboard users can also reach the end of the scrolling menu.
  await nav.focus();
  await page.keyboard.press("End");
  await expect(nav.getByRole("button", { name: "Your review" })).toBeInViewport(
    { ratio: 1 },
  );
  expect(
    await sidebar.evaluate((el) => el.getBoundingClientRect().bottom),
  ).toBeLessThanOrEqual(480);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.setViewportSize({ width: 1280, height: 720 });
  await nav.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Start review", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await page.screenshot({
    path: testInfo.outputPath("laptop-overview.png"),
    fullPage: false,
  });
});

test("long labels and plan titles wrap inside their available space", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1000, height: 600 });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Plan views" });
  const assumptions = nav.getByRole("button", { name: "Assumptions & risks" });
  await assumptions.click();
  const label = assumptions.locator("span").first();
  await label.evaluate((el) => {
    el.textContent =
      "Assumptions, compatibility constraints, and operational risks";
  });
  expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  expect(
    await assumptions.evaluate((el) => el.scrollHeight <= el.clientHeight),
  ).toBe(true);
  await page
    .getByRole("heading", { name: "Assumptions & risks", exact: true })
    .evaluate((el) => {
      el.textContent =
        "Assumptions and compatibility risks for a very long " +
        "ServiceName".repeat(12);
    });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("long-labels.png"),
    fullPage: false,
  });
});

test("a revision without object feedback requires an overall note and stays saved while disconnected", async ({
  page,
  request,
}) => {
  const session = await (await request.get("/api/session")).json();
  const reset = await request.post("/api/review", {
    headers: { origin: "http://127.0.0.1:4319" },
    data: {
      expectedUpdatedAt: session.review.updatedAt,
      review: {
        ...session.review,
        disposition: "in_review",
        assessments: {},
        comments: [],
        overallNote: "",
      },
    },
  });
  expect(reset.ok()).toBe(true);
  await page.goto("/");
  await page.getByRole("button", { name: "Finish review" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("13 items left unreviewed.", { exact: false }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Your agent is not connected.", { exact: false }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Request revision", exact: true })
    .click();
  const reason = dialog.getByRole("textbox", {
    name: "What would you like revised?",
  });
  await expect(reason).toBeFocused();
  await expect(
    dialog.getByRole("button", { name: "Request revision", exact: true }),
  ).toBeDisabled();
  expect(
    (await (await request.get("/api/handoff")).json()).submittedAt,
  ).toBeNull();
  await reason.fill("Please simplify the rollout before implementation.");
  await dialog
    .getByRole("button", { name: "Request revision", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Your agent is not connected",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Done", exact: true })
    .click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download a copy" }).click();
  const download = await downloadPromise;
  const feedback = await readFile((await download.path())!, "utf8");
  expect(feedback).toContain("Disposition: request_changes");
  expect(feedback).toContain("## Overall review note");
  expect(feedback).toContain(
    "Please simplify the rollout before implementation.",
  );
  expect(feedback).toContain("Unreviewed items are not implicitly accepted.");
  expect(feedback).toContain("## Items left unreviewed");
  const saved = await (await request.get("/api/session")).json();
  expect(saved.review.assessments).toEqual({});
});

test("simple object actions and Save draft preserve notes; approval confirms delivery", async ({
  page,
  request,
}, testInfo) => {
  const current = await (await request.get("/api/session")).json();
  await request.post("/api/review", {
    headers: { origin: "http://127.0.0.1:4319" },
    data: {
      expectedUpdatedAt: current.review.updatedAt,
      review: {
        ...current.review,
        disposition: "in_review",
        assessments: {},
        comments: [],
        overallNote: "",
      },
    },
  });
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Key decisions" })
    .click();
  await page.locator(".decision-card").first().click();
  const inspector = page.getByRole("complementary", {
    name: "Object inspector",
  });
  await expect(inspector.getByRole("textbox")).toHaveCount(0);
  await expect(inspector.getByRole("combobox")).toHaveCount(0);
  await inspector.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(
    inspector.getByRole("button", { name: "Accepted", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(inspector.getByRole("textbox")).toHaveCount(0);
  await inspector
    .getByRole("button", { name: "Question", exact: true })
    .click();
  await expect(
    inspector.getByRole("textbox", { name: "What would you like clarified?" }),
  ).toBeFocused();
  await expect(
    inspector.getByRole("button", { name: "Accepted", exact: true }),
  ).toHaveCount(0);
  await expect(
    inspector.getByRole("button", { name: "Accept", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await inspector.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    inspector.getByRole("button", { name: "Accepted", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await inspector.getByRole("button", { name: "Change", exact: true }).click();
  await inspector
    .getByRole("textbox", { name: "What should change?" })
    .fill("Extend the expiry window.");
  await page.screenshot({ path: testInfo.outputPath("object-note.png") });
  await inspector
    .getByRole("button", { name: "Request change", exact: true })
    .click();
  await expect(inspector.getByRole("textbox")).toHaveCount(0);
  await inspector
    .getByRole("button", { name: "Question", exact: true })
    .click();
  await inspector
    .getByRole("textbox", { name: "What would you like clarified?" })
    .fill("Who owns this decision?");
  await page
    .getByRole("button", { name: "Finish review", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const approve = dialog.getByRole("button", {
    name: "Approve entire plan",
    exact: true,
  });
  const revise = dialog.getByRole("button", {
    name: "Request revision",
    exact: true,
  });
  await expect(approve).toBeDisabled();
  expect((await approve.boundingBox())!.y).toBeLessThan(
    (await revise.boundingBox())!.y,
  );
  await expect(
    dialog.getByRole("button", { name: "Save & close", exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Close handoff", exact: true })
    .click();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  const draft = await (await request.get("/api/session")).json();
  expect(draft.review.disposition).toBe("in_review");
  expect(draft.review.comments.map((c: { body: string }) => c.body)).toEqual([
    "Extend the expiry window.",
    "Who owns this decision?",
  ]);
  expect(
    (await (await request.get("/api/handoff")).json()).submittedAt,
  ).toBeNull();
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Key decisions" })
    .click();
  await page.locator(".decision-card").first().click();
  await expect(
    inspector.getByText("Who owns this decision?", { exact: true }),
  ).toBeVisible();
  await inspector.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(inspector.locator(".review-comment.resolved")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Finish review", exact: true })
    .click();
  await expect(approve).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("finish-review.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await approve.boundingBox())!.y).toBeLessThan(
    (await revise.boundingBox())!.y,
  );
  await expect(approve).toBeInViewport({ ratio: 1 });
  await page.screenshot({
    path: testInfo.outputPath("finish-review-mobile.png"),
  });
  const waiter = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/wait.ts",
      "--session",
      current.sessionPath,
      "--timeout",
      "15",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  waiter.stdout.on("data", (chunk) => {
    output += chunk;
  });
  const completed = new Promise<number | null>((resolve) =>
    waiter.on("exit", resolve),
  );
  try {
    await expect(
      dialog.getByText("Your agent is waiting.", { exact: false }),
    ).toBeVisible();
    await approve.click();
    expect(await completed).toBe(0);
    expect(JSON.parse(output.trim()).review.disposition).toBe("approved");
    await expect(
      page.getByRole("dialog", { name: "Plan approved" }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toContainText(
      "Your plan has been approved and sent back to the agent.",
    );
    await page.screenshot({ path: testInfo.outputPath("approval-sent.png") });
  } finally {
    waiter.kill();
  }
  const final = await (await request.get("/api/session")).json();
  expect(final.review.disposition).toBe("approved");
  expect(final.review.comments).toHaveLength(2);
  expect(
    final.review.comments.every((c: { resolved: boolean }) => c.resolved),
  ).toBe(true);
});

test("assumptions, risks, and objections use distinct review meanings", async ({
  page,
  request,
}, testInfo) => {
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Assumptions & risks" })
    .click();
  const inspector = page.getByRole("complementary", {
    name: "Object inspector",
  });
  for (const [kind, action, done, value] of [
    ["assumption", "Confirm", "Confirmed", "confirmed"],
    ["risk", "Acknowledge", "Acknowledged", "acknowledged"],
    ["objection", "Considered", "Considered", "considered"],
  ]) {
    await page.locator(`.attention-row.kind-${kind}`).click();
    await expect(
      inspector.getByRole("button", { name: "Accept", exact: true }),
    ).toHaveCount(0);
    await expect(inspector.locator(".review-guidance")).toBeVisible();
    if (kind === "risk") {
      await inspector
        .getByRole("button", { name: "Question", exact: true })
        .click();
      await inspector
        .getByRole("textbox")
        .fill("How will this risk be mitigated?");
      await inspector
        .getByRole("button", { name: "Add question", exact: true })
        .click();
    }
    await inspector.getByRole("button", { name: action, exact: true }).click();
    await expect(
      inspector.getByRole("button", { name: done, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Draft saved");
    const saved = await (await request.get("/api/session")).json();
    const object = saved.plan.objects.find(
      (o: { kind: string }) => o.kind === kind,
    );
    expect(saved.review.assessments[object.id]).toBe(value);
    if (kind === "risk") {
      expect(
        saved.review.comments.find(
          (c: { body: string }) =>
            c.body === "How will this risk be mitigated?",
        ).resolved,
      ).toBe(false);
      await page.screenshot({ path: testInfo.outputPath("risk-review.png") });
    }
    await inspector.getByRole("button", { name: "Close inspector" }).click();
  }
  await page.getByRole("button", { name: "Finish review" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Approve entire plan" }),
  ).toBeDisabled();
});

test("review actions stay within the inspector when their labels change", async ({
  page,
  request,
}, testInfo) => {
  const current = await (await request.get("/api/session")).json();
  await request.post("/api/review", {
    headers: { origin: "http://127.0.0.1:4319" },
    data: {
      expectedUpdatedAt: current.review.updatedAt,
      review: {
        ...current.review,
        assessments: {},
        comments: [],
        overallNote: "",
        disposition: "in_review",
      },
    },
  });
  page.on("dialog", (dialog) => dialog.accept());
  for (const width of [320, 390, 768, 1000, 1280, 1440, 1512]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    if (width <= 560) {
      await page
        .getByRole("combobox", { name: "Review section" })
        .selectOption("attention");
    } else {
      await page
        .getByRole("navigation")
        .getByRole("button", { name: "Assumptions & risks" })
        .click();
    }
    for (const [kind, action, done] of [
      ["assumption", "Confirm", "Confirmed"],
      ["risk", "Acknowledge", "Acknowledged"],
    ]) {
      await page.locator(`.attention-row.kind-${kind}`).click();
      const inspector = page.getByRole("complementary", {
        name: "Object inspector",
      });
      const controls = inspector.locator(".assessment-controls");
      await controls.getByRole("button", { name: action, exact: true }).click();
      await expect(
        controls.getByRole("button", { name: done, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(
        await controls.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      for (const button of await controls.getByRole("button").all()) {
        const rect = (await button.boundingBox())!;
        const bounds = (await controls.boundingBox())!;
        expect(rect.x).toBeGreaterThanOrEqual(bounds.x);
        expect(rect.x + rect.width).toBeLessThanOrEqual(
          bounds.x + bounds.width + 1,
        );
        expect(
          await button.evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
      }
      for (const label of await controls.locator(".assessment-label").all()) {
        const lines = await label.evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return [...range.getClientRects()].map((rect) => rect.y);
        });
        expect(
          new Set(lines).size,
          `${kind} at ${width}px wraps a button label`,
        ).toBe(1);
        expect(
          await label.evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
      }
      if (width === 320 || width === 1280 || width === 1512)
        await page.screenshot({
          path: testInfo.outputPath(`${kind}-confirmed-${width}.png`),
        });
      await controls
        .getByRole("button", { name: "Question", exact: true })
        .click();
      await expect(
        controls.getByRole("button", { name: done, exact: true }),
      ).toHaveCount(0);
      await expect(
        controls.getByRole("button", { name: action, exact: true }),
      ).toHaveAttribute("aria-pressed", "false");
      await expect(
        controls.getByRole("button", { name: "Question", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await inspector
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      await expect(
        controls.getByRole("button", { name: done, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await controls
        .getByRole("button", { name: "Change", exact: true })
        .click();
      await expect(
        controls.getByRole("button", { name: action, exact: true }),
      ).toHaveAttribute("aria-pressed", "false");
      await expect(
        controls.getByRole("button", { name: done, exact: true }),
      ).toHaveCount(0);
      await expect(
        inspector.getByRole("textbox", { name: "What should change?" }),
      ).toBeFocused();
      await inspector
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      await inspector.getByRole("button", { name: "Close inspector" }).click();
    }
  }
});

test("all accepted items can request an overall revision without losing their assessments", async ({
  page,
  request,
}, testInfo) => {
  const current = await (await request.get("/api/session")).json();
  const assessments = Object.fromEntries(
    current.plan.objects.map((o: { id: string }) => [o.id, "accepted"]),
  );
  const reset = await request.post("/api/review", {
    headers: { origin: "http://127.0.0.1:4319" },
    data: {
      expectedUpdatedAt: current.review.updatedAt,
      review: {
        ...current.review,
        assessments,
        comments: [],
        overallNote: "",
        disposition: "in_review",
      },
    },
  });
  expect(reset.ok()).toBe(true);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Finish review", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Request revision", exact: true })
    .click();
  const reason = dialog.getByRole("textbox", {
    name: "What would you like revised?",
  });
  await reason.fill("   ");
  await expect(
    dialog.getByRole("button", { name: "Request revision", exact: true }),
  ).toBeDisabled();
  await reason.fill(
    "Keep these decisions, but split delivery into two releases.",
  );
  await page.screenshot({ path: testInfo.outputPath("overall-revision.png") });
  await dialog.getByRole("button", { name: "Close handoff" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("status")).toContainText("Draft saved");
  await page.reload();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Your review" })
    .click();
  await expect(page.locator(".overall-review-note")).toContainText(
    "split delivery into two releases",
  );
  await page
    .getByRole("button", { name: "Finish review", exact: true })
    .click();
  await expect(
    dialog.getByRole("textbox", { name: "Overall note (optional)" }),
  ).toHaveValue("Keep these decisions, but split delivery into two releases.");
  const waiter = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/wait.ts",
      "--session",
      current.sessionPath,
      "--timeout",
      "15",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  waiter.stdout.on("data", (chunk) => {
    output += chunk;
  });
  const completed = new Promise<number | null>((resolve) =>
    waiter.on("exit", resolve),
  );
  try {
    await expect(
      dialog.getByText("Your agent is waiting.", { exact: false }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: "Request revision", exact: true })
      .click();
    expect(await completed).toBe(0);
    const result = JSON.parse(output.trim());
    expect(result.review.disposition).toBe("request_changes");
    expect(result.review.assessments).toEqual(assessments);
    expect(result.review.overallNote).toContain(
      "split delivery into two releases",
    );
    expect(result.feedback).toContain("## Overall review note");
    await expect(page.getByRole("status")).toContainText(
      "Your revision request and notes have been sent",
    );
  } finally {
    waiter.kill();
  }
});

test("existing item feedback can include an optional overall note without a second prompt", async ({
  page,
  request,
}, testInfo) => {
  const current = await (await request.get("/api/session")).json();
  await request.post("/api/review", {
    headers: { origin: "http://127.0.0.1:4319" },
    data: {
      expectedUpdatedAt: current.review.updatedAt,
      review: {
        ...current.review,
        assessments: {},
        comments: [],
        overallNote: "",
        disposition: "in_review",
      },
    },
  });
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Key decisions" })
    .click();
  await page.locator(".decision-card").first().click();
  const inspector = page.getByRole("complementary", {
    name: "Object inspector",
  });
  await inspector
    .getByRole("button", { name: "Question", exact: true })
    .click();
  await inspector
    .getByRole("textbox")
    .fill("Why does the link expire after 72 hours?");
  // Finish includes a note still in the object composer.
  await page
    .getByRole("button", { name: "Finish review", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Add an overall note", exact: true })
    .click();
  const overall = dialog.getByRole("textbox", {
    name: "Overall note (optional)",
  });
  await overall.fill("Prioritize onboarding simplicity throughout the plan.");
  await page.screenshot({
    path: testInfo.outputPath("optional-overall-note.png"),
  });
  await dialog
    .getByRole("button", { name: "Request revision", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Revision requested" }),
  ).toBeVisible();
  const saved = await (await request.get("/api/session")).json();
  expect(saved.review.overallNote).toBe(
    "Prioritize onboarding simplicity throughout the plan.",
  );
  expect(saved.review.comments).toHaveLength(1);
  expect(saved.review.comments[0].body).toBe(
    "Why does the link expire after 72 hours?",
  );
  expect(saved.review.assessments["decision-tokens"]).toBe("question");
});

test("overall note expands below the decisions in a centered dialog without resizing", async ({
  page,
  request,
}, testInfo) => {
  const current = await (await request.get("/api/session")).json();
  await request.post("/api/review", {
    headers: { origin: "http://127.0.0.1:4319" },
    data: {
      expectedUpdatedAt: current.review.updatedAt,
      review: {
        ...current.review,
        overallNote: "",
        assessments: {},
        comments: [],
        disposition: "in_review",
      },
    },
  });
  page.on("dialog", (dialog) => dialog.accept());
  for (const [width, height] of [
    [1280, 800],
    [1440, 900],
    [390, 844],
    [1000, 480],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Finish review", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    const decisions = dialog.locator(".finish-decisions");
    const toggle = dialog.getByRole("button", {
      name: "Add an overall note",
      exact: true,
    });
    const controls = (await decisions.boundingBox())!;
    expect(
      (await toggle.boundingBox())!.y - (controls.y + controls.height),
    ).toBeGreaterThanOrEqual(16);
    const rows = [
      await dialog
        .getByRole("button", { name: "Approve entire plan", exact: true })
        .boundingBox(),
      await dialog
        .getByRole("button", { name: "Request revision", exact: true })
        .boundingBox(),
      await toggle.boundingBox(),
    ];
    for (let i = 0; i < rows.length; i++) {
      expect(rows[i]!.height).toBeGreaterThanOrEqual(48);
      expect(rows[i]!.x).toBeCloseTo(rows[0]!.x, 0);
      expect(rows[i]!.width).toBeCloseTo(rows[0]!.width, 0);
      if (i > 0)
        expect(
          rows[i]!.y - rows[i - 1]!.y - rows[i - 1]!.height,
        ).toBeGreaterThanOrEqual(16);
    }
    await page.screenshot({
      path: testInfo.outputPath(`stacked-options-${width}.png`),
    });
    const assertCentered = async () => {
      const box = (await dialog.boundingBox())!;
      expect(box.x + box.width / 2).toBeCloseTo(width / 2, 0);
      expect(box.y + box.height / 2).toBeCloseTo(height / 2, 0);
      expect(box.y).toBeGreaterThanOrEqual(15);
      expect(box.y + box.height).toBeLessThanOrEqual(height - 15);
    };
    await assertCentered();
    await toggle.click();
    const field = dialog.getByRole("textbox", {
      name: "Overall note (optional)",
    });
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute("data-slot", "textarea");
    expect(await field.evaluate((el) => getComputedStyle(el).resize)).toBe(
      "none",
    );
    const fieldBox = (await field.boundingBox())!;
    const decisionBox = (await decisions.boundingBox())!;
    expect(fieldBox.y).toBeGreaterThan(decisionBox.y + decisionBox.height);
    expect(fieldBox.x + fieldBox.width / 2).toBeCloseTo(width / 2, 0);
    await field.fill("Keep the scope focused on the first release.");
    await assertCentered();
    await page.screenshot({
      path: testInfo.outputPath(`overall-note-${width}.png`),
    });
    await field.fill("A longer overall note.\n".repeat(60));
    expect((await field.boundingBox())!.height).toBe(fieldBox.height);
    expect(
      await field.evaluate((el) => el.scrollHeight > el.clientHeight),
    ).toBe(true);
    await assertCentered();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
});

test("buttons contain their labels across review screens and larger text", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90000);
  const current = await (await request.get("/api/session")).json();
  await request.post("/api/review", {
    headers: { origin: "http://127.0.0.1:4319" },
    data: {
      expectedUpdatedAt: current.review.updatedAt,
      review: {
        ...current.review,
        assessments: {},
        comments: [],
        overallNote: "",
        disposition: "in_review",
      },
    },
  });
  page.on("dialog", (dialog) => dialog.accept());
  async function audit(context: string) {
    const problems = await page.evaluate(() => {
      const errors: string[] = [];
      for (const button of document.querySelectorAll<HTMLButtonElement>(
        "button",
      )) {
        if (!button.checkVisibility()) continue;
        const rect = button.getBoundingClientRect();
        const name =
          button.getAttribute("aria-label") ||
          button.textContent?.trim() ||
          button.title;
        if (!name) errors.push("Button missing a label");
        if (rect.height < 35 || rect.width < 35)
          errors.push(`${name}: small target ${rect.width} × ${rect.height}`);
        // Inspect actual glyph bounds: inline spans can report zero scrollWidth even when text clips.
        const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          if (
            !node.textContent?.trim() ||
            !node.parentElement?.checkVisibility()
          )
            continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const textRect of range.getClientRects()) {
            if (
              textRect.width &&
              (textRect.left < rect.left - 1 ||
                textRect.right > rect.right + 1 ||
                textRect.top < rect.top - 1 ||
                textRect.bottom > rect.bottom + 1)
            ) {
              errors.push(`${name}: text outside button`);
            }
          }
        }
      }
      if (document.documentElement.scrollWidth > innerWidth)
        errors.push("Page scrolls horizontally");
      return errors;
    });
    expect(problems, context).toEqual([]);
  }
  for (const width of [320, 390, 1280, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Start review" }),
    ).toBeVisible();
    await audit(`overview ${width}`);
    async function navigate(view: string, name: string) {
      if (width <= 560)
        await page
          .getByRole("combobox", { name: "Review section" })
          .selectOption(view);
      else
        await page
          .getByRole("navigation")
          .getByRole("button", { name, exact: true })
          .click();
    }
    for (const [view, name] of [
      ["decisions", "Key decisions"],
      ["attention", "Assumptions & risks"],
      ["steps", "Implementation"],
      ["supporting", "Supporting detail"],
      ["files", "Proposed files"],
      ["map", "Diagrams"],
      ["feedback", "Your review"],
    ]) {
      await navigate(view, name);
      await audit(`${view} ${width}`);
    }
    await navigate("attention", "Assumptions & risks");
    await page.locator(".attention-row.kind-risk").click();
    const inspector = page.getByRole("complementary", {
      name: "Object inspector",
    });
    await inspector
      .getByRole("button", { name: "Acknowledge", exact: true })
      .click();
    await audit(`acknowledged ${width}`);
    await page.screenshot({
      path: testInfo.outputPath(`acknowledged-${width}.png`),
    });
    const enlarged = await page.addStyleTag({
      content:
        ".inspector button, .inspector button span { font-size: 16px !important; }",
    });
    await audit(`larger labels ${width}`);
    await enlarged.evaluate((el) => el.parentNode?.removeChild(el));
    await inspector
      .getByRole("button", { name: "Question", exact: true })
      .click();
    await audit(`note editor ${width}`);
    await inspector
      .getByRole("textbox")
      .fill("Please explain how this risk will be mitigated.");
    await inspector
      .getByRole("button", { name: "Add question", exact: true })
      .click();
    await audit(`note actions ${width}`);
    await inspector.getByRole("button", { name: "Close inspector" }).click();
    await page
      .getByRole("button", { name: "Finish review", exact: true })
      .click();
    await audit(`finish review ${width}`);
    await page
      .getByRole("button", { name: "Add an overall note", exact: true })
      .click();
    await audit(`overall note ${width}`);
    await page.screenshot({
      path: testInfo.outputPath(`buttons-${width}.png`),
    });
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Review details", exact: true })
      .first()
      .click();
    await page.getByText("Restart from a terminal", { exact: true }).click();
    await audit(`session details ${width}`);
    if (width === 1440) {
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: "Save draft", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText("Draft saved");
      await audit("saved notification");
    }
  }
});

test("positive assessments toggle off and stay cleared after saving and reopening", async ({
  page,
  request,
}) => {
  const current = await (await request.get("/api/session")).json();
  const seedNote = {
    id: crypto.randomUUID(),
    objectId: current.plan.objects.find(
      (o: { kind: string }) => o.kind === "decision",
    ).id,
    kind: "question",
    body: "Earlier clarification, already resolved.",
    createdAt: new Date().toISOString(),
    resolved: true,
  };
  await request.post("/api/review", {
    headers: { origin: "http://127.0.0.1:4319" },
    data: {
      expectedUpdatedAt: current.review.updatedAt,
      review: {
        ...current.review,
        assessments: {},
        comments: [seedNote],
        overallNote: "",
        disposition: "in_review",
      },
    },
  });
  for (const [kind, action, done] of [
    ["decision", "Accept", "Accepted"],
    ["assumption", "Confirm", "Confirmed"],
    ["risk", "Acknowledge", "Acknowledged"],
    ["objection", "Considered", "Considered"],
  ]) {
    const object = current.plan.objects.find(
      (o: { kind: string }) => o.kind === kind,
    );
    const nav = kind === "decision" ? "Key decisions" : "Assumptions & risks";
    const row =
      kind === "decision" ? ".decision-card" : `.attention-row.kind-${kind}`;
    await page.goto("/");
    await page
      .getByRole("navigation")
      .getByRole("button", { name: nav, exact: true })
      .click();
    await page.locator(row).filter({ hasText: object.title }).click();
    const inspector = page.getByRole("complementary", {
      name: "Object inspector",
    });
    await inspector.getByRole("button", { name: action, exact: true }).click();
    await expect(
      inspector.getByRole("button", { name: done, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await inspector.getByRole("button", { name: done, exact: true }).click();
    await expect(
      inspector.getByRole("button", { name: action, exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(
      inspector.locator('.assessment-controls [aria-pressed="true"]'),
    ).toHaveCount(0);
    await expect(inspector.getByRole("textbox")).toHaveCount(0);
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Draft saved");
    const saved = await (await request.get("/api/session")).json();
    expect(saved.review.assessments[object.id]).toBeUndefined();
    expect(saved.review.comments).toEqual([seedNote]);
    await page.reload();
    await page
      .getByRole("navigation")
      .getByRole("button", { name: nav, exact: true })
      .click();
    await page.locator(row).filter({ hasText: object.title }).click();
    await expect(
      inspector.getByRole("button", { name: action, exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
  }
});

test("diagram cards remain readable on laptop screens and after fitting or resizing", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Diagrams" })
    .click();
  await expect(page.locator(".react-flow__node")).toHaveCount(3);
  const checkSize = async () => {
    await expect
      .poll(async () =>
        page
          .locator(".map-node")
          .first()
          .evaluate((node) => node.getBoundingClientRect().width),
      )
      .toBeGreaterThanOrEqual(211);
    const sizes = await page.locator(".map-node").evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        const scale = rect.width / (node as HTMLElement).offsetWidth;
        return (
          parseFloat(getComputedStyle(node.querySelector("strong")!).fontSize) *
          scale
        );
      }),
    );
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11.9);
  };
  await checkSize();
  await page.screenshot({
    path: testInfo.outputPath("laptop-architecture.png"),
    fullPage: true,
  });
  await page
    .getByRole("combobox", { name: "Diagram view" })
    .selectOption("relationships");
  await expect(page.locator(".react-flow__node")).toHaveCount(10);
  await expect(page.locator(".react-flow__minimap")).toBeVisible();
  await expect(page.locator(".react-flow__minimap-node")).toHaveCount(10);
  const viewport = page.locator(".react-flow__viewport");
  const beforePan = await viewport.getAttribute("style");
  const overview = page.locator(".react-flow__minimap-svg");
  await overview.scrollIntoViewIfNeeded();
  const bounds = (await overview.boundingBox())!;
  await page.mouse.move(bounds.x + 75, bounds.y + 50);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 105, bounds.y + 65, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => viewport.getAttribute("style")).not.toBe(beforePan);
  await checkSize();
  await page.getByRole("button", { name: "Zoom Out", exact: true }).click();
  await page
    .getByRole("button", { name: "Reset readable view", exact: true })
    .click();
  await checkSize();
  await page.screenshot({
    path: testInfo.outputPath("laptop-dependencies.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await checkSize();
});

test("submitted reviews reopen their confirmation without resending and stay stable during source revisions", async ({
  page,
  request,
}) => {
  for (const disposition of ["approved", "request_changes"]) {
    const session = await (await request.get("/api/session")).json();
    const response = await request.post("/api/review", {
      headers: { origin: "http://127.0.0.1:4319" },
      data: {
        expectedUpdatedAt: session.review.updatedAt,
        finalize: true,
        review: {
          ...session.review,
          disposition,
          comments: [],
          assessments: {},
          overallNote: "Use shunting yard",
        },
      },
    });
    expect(response.ok()).toBe(true);
    await page.goto("/");
    let submissions = 0;
    const count = (req: import("@playwright/test").Request) => {
      if (req.method() === "POST" && req.url().endsWith("/api/review"))
        submissions++;
    };
    page.on("request", count);
    const sent = page.getByRole("button", {
      name: "Review submitted",
      exact: true,
    });
    await sent.click();
    await expect(
      page.getByRole("dialog").getByRole("heading", {
        name:
          disposition === "approved" ? "Plan approved" : "Revision requested",
      }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("button", { name: "Request revision", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.reload();
    await sent.click();
    expect(submissions).toBe(0);
    page.off("request", count);
    await page.getByRole("button", { name: "Done", exact: true }).click();
  }
  const session = await (await request.get("/api/session")).json();
  const original = await readFile(session.source.path, "utf8");
  let navigations = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  try {
    await writeFile(
      session.source.path,
      original + "\nAgent is writing the next revision.\n",
    );
    await page.waitForTimeout(2500); // Allow a delivery poll while the agent edits the file.
    expect(navigations).toBe(0);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Review submitted", exact: true }),
    ).toBeVisible();
    expect(
      (await (await request.get("/api/session")).json()).source.markdown,
    ).toBe(original);
  } finally {
    await writeFile(session.source.path, original);
  }
});
