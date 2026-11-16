import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * مسار كامل كما يراه المستخدم:
 * معلّم يبني درساً (نص مختلط + كود + صورة + سؤال) ← ينشر ← يصدّر حزمة موقّعة
 * ← طالب يستورد الحزمة ← يدرس ويكمل ويضيف ملاحظة.
 *
 * يعمل على خادم معزول (انظر playwright.config.ts) فلا يمسّ بيانات التطوير.
 */

const PASSWORD = "password123";
const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

async function signUp(
  page: Page,
  user: { name: string; email: string; role: "teacher" | "student" },
) {
  await page.goto("/login");
  await page.getByRole("button", { name: "حساب جديد" }).click();
  await page.getByLabel("الاسم").fill(user.name);
  await page.getByLabel("نوع الحساب").selectOption(user.role);
  await page.getByLabel("البريد الإلكتروني").fill(user.email);
  await page.getByLabel("كلمة المرور").fill(PASSWORD);
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(page.getByRole("heading", { name: "استوديو الإنشاء" })).toBeVisible();
}

test("بناء درس ونشره وتصديره ثم استيراده ودراسته", async ({ page }, testInfo) => {
  // نطاق example.com صالح لدى email-validator (يُرفض .test كاسم محجوز).
  const teacherEmail = `teacher.${stamp}@example.com`;
  const studentEmail = `student.${stamp}@example.com`;
  const courseTitle = `الرياضيات — ${stamp}`;
  const fixturePng = join(dirname(testInfo.file), "fixtures", "cover.png");

  await test.step("تسجيل معلّم وإنشاء مادة", async () => {
    await signUp(page, { name: "أ. اختبار", email: teacherEmail, role: "teacher" });

    await page.getByRole("button", { name: "+ مادة جديدة" }).click();
    await page.getByLabel("اسم المادة").fill(courseTitle);
    await page.getByRole("button", { name: "إنشاء", exact: true }).click();

    await expect(page).toHaveURL(/\/studio\/[0-9a-f]{32}$/);
    await expect(page.getByText("هيكل المادة")).toBeVisible();
  });

  await test.step("بناء الوحدة والدرس والكتل", async () => {
    const addBlock = (label: string) =>
      page.locator(".add-block").getByRole("button", { name: label, exact: true }).click();

    await page.getByRole("button", { name: "+ وحدة" }).click();
    await page.getByRole("button", { name: "+ درس" }).click();
    await page.getByLabel("اسم الدرس").fill("مقدمة في الأعداد");
    await expect(page.getByLabel("اسم الدرس")).toHaveValue("مقدمة في الأعداد");

    // 1) عنوان
    await addBlock("+ عنوان");
    await expect(page.locator(".block")).toHaveCount(1);
    await page.getByPlaceholder("عنوان فرعي").fill("أهلاً بكم");

    // 2) نص عربي مختلط مع كود داخلي
    await addBlock("+ نص");
    await expect(page.locator(".block")).toHaveCount(2);
    const arabic = page.locator(".block .prose").first();
    await arabic.click();
    await page.keyboard.insertText("مثال على الكود: ");
    const codeButton = page.locator(".block .toolbar button[title='كود']");
    await codeButton.click();
    await page.keyboard.insertText("console.log('مرحبا')");
    await codeButton.click();
    await page.keyboard.insertText(" ثم واصل الدرس بصورة واضحة.");
    await expect(arabic).toContainText("مثال على الكود");

    // 3) سؤال تفاعلي
    await addBlock("+ سؤال");
    await expect(page.locator(".block")).toHaveCount(3);
    const quiz = page.locator(".block").filter({ has: page.locator("textarea") });
    await quiz.locator("textarea").fill("ما هو العدد الزوجي؟");

    // 4) صورة عبر مسار الرفع الحقيقي
    const chooserPromise = page.waitForEvent("filechooser");
    await addBlock("+ صورة");
    const chooser = await chooserPromise;
    await chooser.setFiles(fixturePng);
    await expect(page.locator(".block img")).toBeVisible();
    await expect(page.locator(".block")).toHaveCount(4);

    // 5) فقرة إنجليزية خالصة لاختبار اتجاه النص
    await addBlock("+ نص");
    await expect(page.locator(".block")).toHaveCount(5);
    const english = page.locator(".block .prose").nth(1);
    await english.click();
    await page.keyboard.insertText("Use npm install to install dependencies.");

    // الحفظ التلقائي (700ms debounce) يجب أن يصل للخادم قبل النشر
    const courseId = new URL(page.url()).pathname.split("/").filter(Boolean).pop();
    await expect
      .poll(
        async () => {
          const response = await page.request.get(`/api/courses/${courseId}`);
          if (!response.ok()) return -1;
          const data = await response.json();
          return data?.draft?.units?.[0]?.lessons?.[0]?.blocks?.length ?? 0;
        },
        { timeout: 20_000, message: "لم تُحفظ الكتل الخمس تلقائياً" },
      )
      .toBe(5);
  });

  let pkgPath = "";
  await test.step("النشر وتصدير حزمة موقّعة", async () => {
    await page.getByRole("button", { name: "نشر إصدار" }).click();
    await expect(page.locator(".alert-success")).toContainText("تم نشر الإصدار رقم 1");

    await page.getByRole("button", { name: "تصدير", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "تصدير الحزمة" }).click();
    await expect(dialog.getByText("تم بناء الحزمة وتوقيعها بنجاح")).toBeVisible({
      timeout: 60_000,
    });
    await expect(dialog.getByText("Ed25519 ✓")).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("link", { name: "تنزيل الحزمة" }).click(),
    ]);
    pkgPath = testInfo.outputPath("course.edupkg");
    await download.saveAs(pkgPath);

    const bytes = readFileSync(pkgPath);
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  await test.step("تسجيل طالب واستيراد الحزمة", async () => {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.getByRole("button", { name: "خروج" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await signUp(page, { name: "طالب اختبار", email: studentEmail, role: "student" });
    await page.getByRole("link", { name: "حقيبتي" }).click();
    await expect(page.getByRole("heading", { name: "حقيبتي الدراسية" })).toBeVisible();

    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /استيراد حزمة/ }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(pkgPath);

    await expect(page).toHaveURL(/\/library\/[0-9a-f]{32}$/, { timeout: 60_000 });
    await expect(page.getByText("محتوى المادة")).toBeVisible();
  });

  await test.step("دراسة الدرس والتحقق من اتجاه النص المختلط", async () => {
    await expect(page.getByRole("heading", { name: "مقدمة في الأعداد" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "أهلاً بكم" })).toBeVisible();
    await expect(page.getByText("مثال على الكود")).toBeVisible();
    await expect(page.getByText("Use npm install to install dependencies.")).toBeVisible();
    await expect(page.getByText("ما هو العدد الزوجي؟")).toBeVisible();

    const image = page.locator(".reader-body img").first();
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBeGreaterThan(0);

    // الاتجاه: كل فقرة تتبع أول حرف قوي فيها، والكود يبقى LTR معزولاً.
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");

    const paragraphs = page.locator(".prose-read p");
    await expect(paragraphs).toHaveCount(2);
    expect(await paragraphs.nth(0).evaluate((element) => element.matches(":dir(rtl)"))).toBe(true);
    expect(await paragraphs.nth(1).evaluate((element) => element.matches(":dir(ltr)"))).toBe(true);

    const code = page.locator(".prose-read code").first();
    await expect(code).toBeVisible();
    expect(await code.evaluate((element) => getComputedStyle(element).direction)).toBe("ltr");
    expect(await code.evaluate((element) => getComputedStyle(element).unicodeBidi)).toBe("isolate");

    await page.getByRole("button", { name: "الخيار الأول" }).click();
    await expect(page.getByText("✓ إجابة صحيحة")).toBeVisible();
  });

  await test.step("إكمال الدرس وإضافة ملاحظة تدوم بعد إعادة التحميل", async () => {
    await page.getByRole("button", { name: "إكمال الدرس" }).click();
    await expect(page.locator(".badge-green")).toContainText("مكتمل");
    await expect(page.getByText("1 / 1 درس مكتمل")).toBeVisible();

    const note = "ملاحظة E2E: راجع الأمثلة قبل الاختبار";
    await page.getByPlaceholder("أضف ملاحظة…").fill(note);
    await page.getByRole("button", { name: "إضافة", exact: true }).click();
    await expect(page.getByText(note)).toBeVisible();

    await page.reload();
    await expect(page.getByText(note)).toBeVisible();
    await expect(page.getByText("1 / 1 درس مكتمل")).toBeVisible();
  });
});
