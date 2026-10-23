# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/teacher.reporter.spec.ts >> Yawp Reporter >> keeps Reporter controls in bounds at desktop and mobile breakpoints
- Location: e2e/tests/teacher.reporter.spec.ts:169:3

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

- Array []
+ Array [
+   "This Suspense boundary received an update before it finished hydrating. This caused the boundary to switch to client rendering. The usual way to fix this is to wrap the original update in startTransition.",
+ ]
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - button "Open developer tools" [ref=e3] [cursor=pointer]:
    - img [ref=e4]
  - progressbar [ref=e6]
  - main [ref=e9]:
    - navigation [ref=e10]:
      - generic [ref=e11]:
        - link "Logo" [ref=e12] [cursor=pointer]:
          - /url: /app
          - img "Logo" [ref=e13]
        - button "Close app navigation" [ref=e14] [cursor=pointer]:
          - img [ref=e15]
      - generic [ref=e19]:
        - link "Dashboard" [ref=e21] [cursor=pointer]:
          - /url: /app
          - img [ref=e22]
          - generic [ref=e25]: Dashboard
        - link "My Classes" [ref=e27] [cursor=pointer]:
          - /url: /app/my-classes
          - img [ref=e28]
          - generic [ref=e33]: My Classes
        - link "My Assignments" [ref=e35] [cursor=pointer]:
          - /url: /app/assignments
          - img [ref=e36]
          - generic [ref=e39]: My Assignments
        - link "Documents" [ref=e41] [cursor=pointer]:
          - /url: /app/documents
          - img [ref=e42]
          - generic [ref=e45]: Documents
        - link "Writing Practice" [ref=e47] [cursor=pointer]:
          - /url: /app/writing-lessons
          - img [ref=e48]
          - generic [ref=e50]: Writing Practice
        - link "Teacher's Lounge" [ref=e52] [cursor=pointer]:
          - /url: /app/teacher-trainings
          - img [ref=e53]
          - generic [ref=e56]: Teacher's Lounge
        - link "Reporter" [ref=e58] [cursor=pointer]:
          - /url: /app/reporter
          - img [ref=e59]
          - generic [ref=e63]: Reporter
        - link "Lesson Planner" [ref=e65] [cursor=pointer]:
          - /url: /app/lesson-planner
          - img [ref=e66]
          - generic [ref=e68]: Lesson Planner
        - link "Organization" [ref=e70] [cursor=pointer]:
          - /url: /app/organization
          - img [ref=e71]
          - generic [ref=e82]: Organization
      - button "Settings" [ref=e84] [cursor=pointer]:
        - generic [ref=e85]:
          - img [ref=e86]
          - paragraph [ref=e89]: Settings
    - generic [ref=e90]:
      - generic [ref=e91]:
        - button [ref=e92] [cursor=pointer]:
          - img [ref=e93]
        - link "Home" [ref=e97] [cursor=pointer]:
          - /url: /app
        - button [ref=e98] [cursor=pointer]:
          - img [ref=e99]
      - generic [ref=e104]:
        - generic [ref=e106]:
          - img [ref=e107]
          - heading "Yawp! Reporter" [level=2] [ref=e111]
          - link "See how it works" [ref=e112] [cursor=pointer]:
            - /url: /app/reporter/how-it-works
            - img [ref=e113]
          - generic [ref=e116]:
            - generic [ref=e117]: Past reports
            - combobox "Past reports" [ref=e118]:
              - option "Past reports" [selected]
            - button "New report" [ref=e119] [cursor=pointer]:
              - img [ref=e120]
        - generic [ref=e123]:
          - generic [ref=e124]:
            - img [ref=e126]
            - heading "What would you like to know?" [level=3] [ref=e129]
            - paragraph [ref=e130]: Yawp! Reporter reads your classes, assignments, and released grades to answer questions and build reports. Try one of these, or just ask.
          - generic [ref=e131]:
            - button "Grade report for a class" [ref=e132] [cursor=pointer]
            - button "Growth report for a student" [ref=e133] [cursor=pointer]
            - button "Cold vs. warm writes" [ref=e134] [cursor=pointer]
            - button "Who needs attention?" [ref=e135] [cursor=pointer]
            - button "How are my classes doing?" [ref=e136] [cursor=pointer]
        - generic [ref=e138]:
          - textbox "Message Yawp! Reporter" [ref=e139]:
            - /placeholder: Ask Yawp! Reporter…
          - button "Send message" [disabled]:
            - img
  - region "Notifications alt+T"
```

# Test source

```ts
  120 |     await expect(page.getByTestId('guide-uses')).toContainText(
  121 |       /parent-teacher conferences/i
  122 |     );
  123 |     // The section a school approving Reporter reads first.
  124 |     const wont = page.getByTestId('guide-wont');
  125 |     await expect(wont).toContainText(/change, give, or release grades/i);
  126 |     await expect(wont).toContainText(/other teachers’ classes/i);
  127 |     // The clips are served from the app, not an outside site.
  128 |     await expect(page.locator('video source').first()).toHaveAttribute(
  129 |       'src',
  130 |       /^\/img\/reporter-guide\/.+\.mp4$/
  131 |     );
  132 | 
  133 |     await page.getByRole('link', { name: /back to reporter/i }).click();
  134 |     await expect(page).toHaveURL(/\/app\/reporter$/);
  135 |   });
  136 | 
  137 |   test('keeps the how-it-works guide teacher-only', async ({
  138 |     page,
  139 |     signIn,
  140 |     e2eContext,
  141 |   }) => {
  142 |     await signIn(e2eContext.userEmail, STUDENT_PASSWORD);
  143 |     await page.goto('/app/reporter/how-it-works');
  144 |     await expect(page).toHaveURL(/\/app(?!\/reporter)/);
  145 |   });
  146 | 
  147 |   test('keeps the how-it-works guide in bounds on a phone', async ({
  148 |     page,
  149 |     signIn,
  150 |     e2eContext,
  151 |   }) => {
  152 |     await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
  153 |     await page.setViewportSize({ width: 390, height: 844 });
  154 | 
  155 |     await page.goto('/app/reporter');
  156 |     // Icon only at this width, still named for anyone using a screen reader.
  157 |     await expect(
  158 |       page.getByRole('link', { name: 'See how it works' })
  159 |     ).toBeVisible();
  160 | 
  161 |     await page.goto('/app/reporter/how-it-works');
  162 |     await expect(page.getByTestId('guide-wont')).toBeVisible();
  163 |     const overflow = await page.evaluate(
  164 |       () => document.documentElement.scrollWidth - window.innerWidth
  165 |     );
  166 |     expect(overflow).toBeLessThanOrEqual(0);
  167 |   });
  168 | 
  169 |   test('keeps Reporter controls in bounds at desktop and mobile breakpoints', async ({
  170 |     page,
  171 |     signIn,
  172 |     e2eContext,
  173 |   }) => {
  174 |     const consoleErrors: string[] = [];
  175 |     const pageErrors: string[] = [];
  176 |     page.on('console', (message) => {
  177 |       if (message.type() === 'error') consoleErrors.push(message.text());
  178 |     });
  179 |     page.on('pageerror', (error) => pageErrors.push(error.message));
  180 | 
  181 |     await setReporterEnabled(e2eContext.organizationId, true);
  182 |     await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
  183 | 
  184 |     for (const viewport of [
  185 |       { width: 1440, height: 1000 },
  186 |       { width: 390, height: 844 },
  187 |     ]) {
  188 |       await page.setViewportSize(viewport);
  189 |       await page.goto('/app/reporter');
  190 | 
  191 |       const composer = page.getByLabel('Message Yawp! Reporter');
  192 |       const send = page.getByRole('button', { name: 'Send message' });
  193 |       await expect(composer).toBeVisible();
  194 |       await expect(send).toBeVisible();
  195 |       if (viewport.width === 390) {
  196 |         await expect(page.getByLabel('Past reports')).toBeVisible();
  197 |         await expect(
  198 |           page.getByRole('button', { name: 'New report' })
  199 |         ).toBeVisible();
  200 |       }
  201 | 
  202 |       for (const control of [composer, send]) {
  203 |         const box = await control.boundingBox();
  204 |         expect(box).not.toBeNull();
  205 |         expect(box!.x).toBeGreaterThanOrEqual(0);
  206 |         expect(box!.y).toBeGreaterThanOrEqual(0);
  207 |         expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  208 |         expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  209 |       }
  210 | 
  211 |       const overflow = await page.evaluate(() => ({
  212 |         body: document.body.scrollWidth - window.innerWidth,
  213 |         document: document.documentElement.scrollWidth - window.innerWidth,
  214 |       }));
  215 |       expect(overflow.body).toBeLessThanOrEqual(0);
  216 |       expect(overflow.document).toBeLessThanOrEqual(0);
  217 |     }
  218 | 
  219 |     expect(consoleErrors).toEqual([]);
> 220 |     expect(pageErrors).toEqual([]);
      |                        ^ Error: expect(received).toEqual(expected) // deep equality
  221 |   });
  222 | });
  223 | 
```