import html, json
D = {
 'tutor': '1Z0Ps7iSCXEaam9wJwGxlrrRTaw8DiERL',
 'pre-writing': '1o8GOg-1yJBTAjRL-srumHe5ZnJh93dkh',
 'thesis-builder': '1cUUAz_1ULLPHA9dyijhS-Rl3ql2dwRJD',
 'student-feedback': '1ta601TLy_YNXPaMUsa0-podrZ3m4RVnc',
 'class-starter': '18ODFp8dJjk9ydC4gVX5DQTc08mU7Ju86',
 'prompt-library': '19hD_8jxFhMNgrNztIARYt3fEJt5IlbDR',
 'exit-ticket': '1IemSwpc7PmNnSYJM0ph9c2KD9jGXTdui',
 'writing-practice': '19xDx3djZrGRKEvNBsMgFoahM9tRmUX_h',
 'grading-assistant': '1Q1pfLsv6997UCIG-3hLNqt3TphenUWbw',
 'margin-comments': '15zAB7Wh499fbR9YOGR3bGS7SwDWUQUgc',
 'grading-workflow': '1TlD__OtoBV80-kLIF1lY4SIH9sadewGf',
 'class-summary': '1UEEi8FOXdRU8KKhmDeSXcqdn0-YkKId9',
 'reporter': '1iyQOKLVcorhw6NHfJidgVNwE-12hxRBn',
}
SECTIONS = [
 ('For students', 'The Tutor coaches every step of the essay. It never writes for them.', [
  ('tutor', 'Yawp! Tutor', 23, 'Maya asks for feedback on her body paragraphs. The Tutor says what’s working and asks what her quotation reveals, and she writes the analysis herself.'),
  ('pre-writing', 'Pre-writing with the Tutor', 20, 'Maya’s messy pre-write gets a reply that pushes her thinking further, until she names the focus of her essay.'),
  ('thesis-builder', 'Thesis Builder', 23, 'The Tutor teaches what makes a thesis strong, gives feedback on Maya’s observation and analysis, and she writes the thesis.'),
  ('student-feedback', 'What Students See', 21, 'Maya opens her released grade: rubric scores, her teacher’s margin comments, and grammar notes with the rule behind each. Then she revises.'),
 ]),
 ('Planning lessons', 'Ready-made writing for the first five minutes, the last five, and everything in between.', [
  ('class-starter', 'Class Starter', 24, 'Pick a warm-up from a library of 200 prompts, or write your own, and send it to the class in seconds.'),
  ('prompt-library', 'Essay Prompt Library', 21, 'Search 100 thesis-driven essay prompts. Pick one, and the assignment comes set up with grading and the Tutor.'),
  ('exit-ticket', 'Exit Ticket', 23, 'Name the idea you taught today, and Yawp! writes the question students answer in the last five minutes of class.'),
  ('writing-practice', 'Writing Practice', 21, 'Short grammar and style lessons, each with the rule and examples. Mix the skills your class needs into one practice set.'),
 ]),
 ('Grading and feedback', 'Faster grading, with the teacher in charge of every grade.', [
  ('grading-assistant', 'Grading Assistant', 26, 'One click scores a full essay on the rubric, drafts feedback, and highlights every grammar issue in purple. The teacher edits and saves.'),
  ('margin-comments', 'Margin Comments', 21, 'Highlight any sentence and leave a comment the student sees right beside their own words.'),
  ('grading-workflow', 'Grading Workflow', 20, 'Every essay sorted into Needs Grading, Graded, Released, and In Progress. Open one, then go straight to the next.'),
 ]),
 ('Knowing your class', 'See who needs help, and what to teach next.', [
  ('class-summary', 'Class Performance Summary', 20, 'One click summarizes every graded essay: strengths and gaps by rubric skill, which students need help, and a next step.'),
  ('reporter', 'Yawp! Reporter', 23, 'Ask “Who needs attention?” and get the students who are slipping, why, and what to try next.'),
 ]),
]
e = html.escape
cards_pages = []
n = 0
body = []
for title, sub, items in SECTIONS:
    cards = []
    for key, name, secs, desc in items:
        n += 1
        fid = D[key]
        watch = f'https://drive.google.com/file/d/{fid}/view'
        dl = f'https://drive.google.com/uc?export=download&id={fid}'
        cards.append(f'''<div class="card">
  <a href="{watch}" class="thumb"><img src="{key}.jpg"><span class="play">▶</span><span class="len">0:{secs:02d}</span></a>
  <div class="meta"><div class="num">{n:02d}</div><div class="name">{e(name)}</div></div>
  <p>{e(desc)}</p>
  <div class="links"><a class="btn dark" href="{watch}">Watch</a><a class="btn" href="{dl}">Download .mp4</a></div>
</div>''')
    body.append(f'<section><h2>{e(title)}</h2><div class="sub">{e(sub)}</div><div class="grid">{"".join(cards)}</div></section>')

folder = 'https://drive.google.com/drive/folders/19IjdxpV8arYhPtZ-x_-HGKKLeeAjkleu'
doc = f'''<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page {{ size: Letter; margin: 0.55in 0.55in 0.6in; }}
* {{ box-sizing: border-box; }}
body {{ font-family: Inter, "Helvetica Neue", Arial, sans-serif; color: #1A1F2E; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
.cover {{ height: 9.6in; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; page-break-after: always; padding: 0 0.2in; }}
.cover img {{ width: 120px; }}
.cover h1 {{ font-size: 44px; line-height: 1.05; letter-spacing: -0.02em; margin: 28px 0 14px; }}
.cover .lede {{ font-size: 17px; line-height: 1.5; color: #3A3F4B; max-width: 5.6in; }}
.bar {{ width: 70px; height: 6px; border-radius: 3px; background: #1F4D3A; margin-top: 26px; }}
.cover ol {{ columns: 2; column-gap: 0.5in; padding-left: 0; list-style: none; margin: 26px 0 0; font-size: 13.5px; line-height: 1.9; }}
.cover ol a {{ color: #1A1F2E; text-decoration: none; }}
.cover ol span {{ color: #1F4D3A; font-weight: 700; display: inline-block; width: 26px; }}
.cover .folder {{ margin-top: 30px; font-size: 13.5px; }}
.cover .folder a {{ color: #1F4D3A; font-weight: 600; }}
.note {{ margin-top: 28px; font-size: 11.5px; line-height: 1.55; color: #5A5F6B; max-width: 6.2in; border-top: 1px solid #E3DED3; padding-top: 12px; }}
section {{ page-break-inside: auto; margin-bottom: 18px; }}
section + section {{ page-break-before: always; }}
h2 {{ font-size: 24px; letter-spacing: -0.01em; margin: 0 0 4px; }}
.sub {{ font-size: 13px; color: #5A5F6B; margin-bottom: 16px; }}
.grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 18px 22px; }}
.card {{ break-inside: avoid; border: 1px solid #E6E1D6; border-radius: 12px; padding: 10px 10px 12px; background: #FBF9F5; }}
.thumb {{ position: relative; display: block; border-radius: 8px; overflow: hidden; border: 1px solid #E6E1D6; }}
.thumb img {{ width: 100%; display: block; }}
.play {{ position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); width: 44px; height: 44px; border-radius: 50%; background: rgba(26,31,46,.82); color: #fff; font-size: 17px; display: flex; align-items: center; justify-content: center; padding-left: 3px; }}
.len {{ position: absolute; right: 8px; bottom: 8px; background: rgba(26,31,46,.82); color: #fff; font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 10px; }}
.meta {{ display: flex; align-items: baseline; gap: 8px; margin: 10px 2px 4px; }}
.num {{ font-size: 12px; font-weight: 700; color: #1F4D3A; }}
.name {{ font-size: 16px; font-weight: 700; }}
.card p {{ font-size: 12px; line-height: 1.5; color: #3A3F4B; margin: 0 2px 10px; min-height: 54px; }}
.links {{ display: flex; gap: 8px; margin: 0 2px; }}
.btn {{ font-size: 12px; font-weight: 600; text-decoration: none; color: #1F4D3A; border: 1.5px solid #1F4D3A; border-radius: 999px; padding: 4px 12px; }}
.btn.dark {{ background: #1F4D3A; color: #fff; }}
</style></head><body>
<div class="cover">
  <img src="logo.png">
  <h1>Yawp! feature demos</h1>
  <div class="lede">Thirteen short videos (20 to 26 seconds each) of Yawp! features, recorded in the real app. They’re silent, 1080p, and captioned, and you can download each one as an MP4.</div>
  <div class="bar"></div>
  <ol>{"".join(f'<li><span>{i:02d}</span><a href="https://drive.google.com/file/d/{D[k]}/view">{e(nm)}</a></li>' for i,(k,nm) in enumerate([(it[0],it[1]) for _,_,its in SECTIONS for it in its],1))}</ol>
  <div class="folder">All thirteen in one place: <a href="{folder}">the Yawp! Demo Videos folder in Google Drive</a></div>
  <div class="note">Recorded in the Yawp! app with a demo class: the students, their writing and their grades are invented. The app had no AI model connected, so the AI’s words (the Tutor’s replies, the Grading Assistant’s comments and grammar notes, and Reporter’s report) were scripted to match what each feature does. The Drive files are private to the owner’s account until shared, so share the folder before sending these links to anyone else.</div>
</div>
{"".join(body)}
</body></html>'''
open('catalog.html','w').write(doc)
