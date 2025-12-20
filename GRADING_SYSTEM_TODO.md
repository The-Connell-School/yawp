# Essay Grading System - TODO Checklist

**Branch:** `claude/essay-grading-tool-dsYol`

## ✅ Completed (Backend)

- [x] Database schema (Prisma models)
- [x] API endpoints (AI feedback, CRUD operations)
- [x] Rubric categories configuration
- [x] AI prompts with Socratic approach
- [x] Highlight text matching utilities
- [x] TipTap extensions (EssayHighlight mark + plugin)
- [x] CSS styling for category colors
- [x] Editor integration

---

## 🚧 TODO: UI Components

### Phase 1: Core Grading Interface (Must Have)

- [ ] **1.1 Run database migration**
  - `cd packages/prisma && bun prisma migrate dev --name add_essay_grading`
  - Verify tables created in Prisma Studio

- [ ] **1.2 Create grading dialog shell**
  - File: `app/routes/app_.documents_.$id/grading/grading-dialog.tsx`
  - Import Dialog component from `~/components/ui/dialog`
  - Add state for step management (step 1 vs step 2)

- [ ] **1.3 Build Step 1: Rubric Selection**
  - File: `app/routes/app_.documents_.$id/grading/step-1-rubric-selection.tsx`
  - Use RVF form with `RubricSelectionSchema`
  - Checkbox for each of 5 categories
  - "Use Full Rubric" checkbox
  - Validation: At least 1 category required
  - "Next" button to proceed to Step 2

- [ ] **1.4 Build Step 2: Scoring Interface**
  - File: `app/routes/app_.documents_.$id/grading/step-2-scoring.tsx`
  - Call `/api/domain/grade-essay` on mount
  - Show loading spinner while AI generates
  - For each category: score selector (1-4) + feedback textarea
  - Overall feedback textarea
  - "Back" and "Save Grade" buttons

- [ ] **1.5 Implement save functionality**
  - In Step 2, on "Save Grade" click:
  - Generate highlights using `generateAllHighlights()`
  - POST to `/api/model/essay-grade`
  - Handle success/error states
  - Close dialog on success

- [ ] **1.6 Add "Grade Essay" button**
  - File: `app/routes/app_.documents_.$id/route.tsx`
  - Add button to navbar (only visible to teachers)
  - Check: `isViewingAsTeacher === true`
  - Opens grading dialog on click

---

### Phase 2: Viewing Grades (Must Have)

- [ ] **2.1 Load grades in document loader**
  - File: `app/routes/app_.documents_.$id/route.tsx`
  - Add to Prisma query:
    ```typescript
    essayGrades: {
      include: {
        categoryScores: { orderBy: { category: 'asc' } },
        highlights: { orderBy: { position: 'asc' } },
        graderProfile: { include: { user: true } }
      },
      orderBy: { createdAt: 'desc' }
    }
    ```

- [ ] **2.2 Create graded essay view component**
  - File: `app/routes/app_.documents_.$id/grading/graded-view.tsx`
  - Show grade metadata (grader, date, type)
  - Display category scores with color badges
  - Show overall score (calculated average)
  - Grade selector if multiple grades exist

- [ ] **2.3 Apply highlights to editor**
  - When viewing a grade, apply highlight marks to essay
  - Use `editor.commands.setEssayHighlight()` for each highlight
  - Consider: Load graded `essayHtml` snapshot vs current document

- [ ] **2.4 Build highlight feedback panel**
  - File: `app/routes/app_.documents_.$id/grading/highlight-feedback-panel.tsx`
  - Listen for `essay-highlight-click` events
  - Display feedback for clicked highlight
  - Show: category badge, quoted text, specific feedback
  - "X" button to close

---

### Phase 3: Polish & UX (Should Have)

- [ ] **3.1 Add grade badge to document list**
  - Files: Student document lists, teacher views
  - Show "Graded" badge if `document.essayGrades.length > 0`
  - Include `essayGrades` in document queries

- [ ] **3.2 Add loading states**
  - Spinner when AI is generating feedback
  - Skeleton loaders for grade display
  - Button disabled states during saves

- [ ] **3.3 Add error handling**
  - Toast notifications for errors
  - Retry button if AI fails
  - Validation error messages

- [ ] **3.4 Add success feedback**
  - Toast: "Grade saved successfully"
  - Smooth transitions between steps
  - Confetti or celebration on first grade? 🎉

---

### Phase 4: Advanced Features (Nice to Have)

- [ ] **4.1 Edit existing grades**
  - "Edit Grade" button in graded view
  - Re-open grading dialog with existing data
  - PUT to `/api/model/essay-grade/:id`

- [ ] **4.2 Delete grades**
  - "Delete Grade" button with confirmation
  - DELETE to `/api/model/essay-grade/:id`

- [ ] **4.3 Student self-assessment**
  - Allow students to grade their own essays
  - Set `graderType: 'student'`
  - Show both teacher and student grades

- [ ] **4.4 Print/export graded essay**
  - PDF export with highlighted text
  - Include all scores and feedback

- [ ] **4.5 Grade analytics dashboard**
  - Show student progress over time
  - Category-specific trends
  - Class-wide statistics

- [ ] **4.6 Bulk grading**
  - Grade multiple essays at once
  - Queue system for AI generation

---

## 🧪 Testing

- [ ] **Unit tests**
  - API endpoint permissions
  - Highlight text matching
  - Score calculations

- [ ] **Integration tests**
  - Full grading workflow
  - Multiple grades per document
  - Teacher vs student grades

- [ ] **E2E tests (Playwright)**
  - Teacher grades essay
  - Highlights appear correctly
  - Feedback panel works
  - Student views grade

- [ ] **Manual testing**
  - Mobile: Touch interactions
  - Mobile: Responsive dialog
  - Long essays: Performance
  - Edge cases: Empty essay, special characters
  - AI failures: Error handling

---

## 🚀 Deployment

- [ ] **Pre-deployment**
  - Code review
  - All tests passing
  - Performance testing

- [ ] **Deployment steps**
  - Run migration on production: `bun prisma migrate deploy`
  - Set `ANTHROPIC_API_KEY` environment variable
  - Deploy code to production

- [ ] **Post-deployment**
  - Monitor AI API usage
  - Check error rates
  - Gather user feedback

---

## 📊 Progress Tracker

**Backend:** ✅ 100% Complete (11/11)
**Frontend:** ⏳ 0% Complete (0/19)
**Testing:** ⏳ 0% Complete (0/5)
**Deployment:** ⏳ 0% Complete (0/6)

**Overall:** 26% Complete (11/41 tasks)

---

## ⏱️ Time Estimates

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| Phase 1: Core Grading | 6 | 4-6 hours |
| Phase 2: Viewing Grades | 4 | 3-4 hours |
| Phase 3: Polish & UX | 4 | 2-3 hours |
| Phase 4: Advanced (Optional) | 6 | 4-6 hours |
| Testing | 5 | 2-3 hours |
| Deployment | 6 | 1-2 hours |
| **Total (Phases 1-3 + Testing)** | **19** | **12-16 hours** |
| **Total (All Features)** | **31** | **20-30 hours** |

**Recommendation:** Start with Phases 1-2 for MVP, then iterate based on user feedback.

---

## 🎯 MVP Definition (Minimum Viable Product)

To launch with basic functionality:

**Must Complete:**
- ✅ Backend (already done)
- [ ] Phase 1: Core Grading (6 tasks)
- [ ] Phase 2: Viewing Grades (4 tasks)
- [ ] Basic testing (manual + key E2E tests)
- [ ] Deployment

**MVP Time:** ~12-16 hours

**Can Skip for MVP:**
- Phase 3: Polish (add after user feedback)
- Phase 4: Advanced features (add incrementally)
- Comprehensive test coverage (add gradually)

---

## 📝 Notes

- Each checkbox represents a discrete, completable task
- Files are suggested locations - adjust to your project structure
- Code examples are in `GRADING_SYSTEM_EXAMPLES.md`
- Full documentation in `GRADING_SYSTEM_HANDOFF.md`

---

**Last Updated:** December 20, 2024
