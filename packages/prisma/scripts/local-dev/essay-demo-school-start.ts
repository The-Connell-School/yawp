/**
 * Essay demo assignment: "Should our school start later?"
 *
 * Ten 10th-grade argumentative essays on moving the high school start time
 * from 7:30 to 8:30. Eight are graded; Jonah's and Theo's are handed in and
 * waiting. The class is weakest in thesis and voice. Aaliyah's paper is the
 * thesis model and Marcus's the thesis near miss; Sofia's is the voice model
 * and Maya's the voice near miss.
 */
import type { EssayDemoAssignment } from './essay-demo-data';

export const SCHOOL_START_ESSAY: EssayDemoAssignment = {
  title: 'Should our school start later?',
  prompt:
    'Our district is considering moving the high school start time from 7:30 to 8:30. Write a thesis-driven argumentative essay that takes a clear position on the change. Support your claim with evidence (research, data, examples, or experience), explain your reasoning, and respond fairly to the strongest argument on the other side.',
  assignedDaysAgo: 6,
  submissions: [
    {
      studentKey: 'aaliyah',
      title: 'Later Bells, Smarter Buses: Why 8:30 Only Works With a Plan',
      submittedDaysAgo: 2,
      paragraphs: [
        "Every school morning at 7:30, our first-period teachers face a room of students who are physically present but mentally still in bed. The district's proposal to move the high school start time to 8:30 is a response to a real problem, and I support it. But a later bell by itself will not fix that problem, and it could create new ones. Our district should move the start time to 8:30, but only if it redesigns bus routes and adjusts the athletic schedule at the same time, because the benefits of more sleep depend on students actually getting to school on time and getting home at a reasonable hour.",
        "The case for a later start begins with biology, not laziness. During puberty, teenagers' circadian rhythms shift later, which means most of us do not feel sleepy until around 11 p.m. no matter how early we have to get up. That is why the American Academy of Pediatrics recommended in 2014 that middle and high schools start no earlier than 8:30 a.m., so that students can get the eight and a half to nine and a half hours of sleep they need. Our current schedule asks a body that is wired to fall asleep at 11 to wake up at 6. The math does not work, and no amount of telling teenagers to go to bed earlier will change a biological clock.",
        "We also know that a later start can work in practice. When Seattle Public Schools moved its high school start time from 7:50 to 8:45 in 2016, researchers from the University of Washington tracked students before and after the change. They found that students slept about 34 minutes more per night, and that grades in the class they studied went up while first-period tardiness and absences went down. Thirty-four minutes may not sound dramatic, but it adds up to almost three extra hours of sleep over a school week. That is the difference between a student who can focus in chemistry and a student who reads the same sentence four times.",
        "However, Seattle's success did not come from changing a single number on the bell schedule. A later start affects everything that is built around the school day, and our district has to plan for that. The first issue is transportation. Many districts use the same buses for high school, middle school, and elementary routes, staggering them so one fleet can cover all three. If the high school moves to 8:30, the district may have to either buy more buses or flip the elementary schedule earlier, which would put seven-year-olds at bus stops in the dark. Before the board votes, it should publish a new route plan that shows what the change will cost and which students it will affect. The second issue is athletics. If school ends an hour later, practices end an hour later, and away games may mean athletes miss their last class to travel. The district should work with the athletic conference to shift game times and protect athletes from losing class time, or the students who are already busiest will lose the sleep the change was meant to give them.",
        "The strongest argument against the change is that students will simply stay up an hour later and erase the benefit. This concern deserves a real answer, because it sounds like common sense. But the research does not support it. In Seattle, students' bedtimes stayed about the same after the change; they just woke up later. That makes sense if bedtime is controlled mainly by biology rather than by choice. Opponents are right that a later start will not help a student who scrolls on a phone until 2 a.m., but a policy does not have to fix every habit to be worth adopting. It only has to stop working against the students who are trying to get enough sleep.",
        "Moving the start time to 8:30 is the right goal, but the board should treat it as the beginning of a plan rather than the whole plan. If the district pairs the later bell with new bus routes and a realistic athletic schedule, it can give students the sleep their bodies need without shifting the cost onto younger kids, families, or athletes. If it changes the bell and nothing else, it risks proving the critics right for the wrong reasons.",
      ],
      grade: {
        scores: {
          thesis_and_content: 5,
          organization_and_structure: 4,
          evidence_and_support: 4,
          voice_and_style: 4,
          grammar_and_mechanics: 4,
        },
        comments: {
          thesis_and_content:
            "Your thesis is exactly what an argumentative claim should be: arguable, qualified, and specific about the conditions under which you'd support the change. You hold onto that 'only if' all the way to your last sentence.",
          organization_and_structure:
            "Each paragraph has a clear job, and the move from 'why later' to 'what has to change with it' is smart. Paragraph 4 is doing two jobs (buses and athletics); splitting it would let each condition land harder.",
          evidence_and_support:
            'The AAP recommendation and the Seattle study are well chosen and accurately used. Your bus and athletics points would be stronger with one local fact, like how many routes our district actually runs.',
          voice_and_style:
            'Confident and measured, with a tone that fits a board audience. Your closing line has real punch; a few more moments like that in the body paragraphs would bring this to a 5.',
          grammar_and_mechanics:
            'Clean and controlled throughout. Your longest sentences, like the last one in your intro, could use a breath or two.',
        },
        overallComment:
          "This is the thesis I'll be showing the class: it takes a side, sets conditions, and previews exactly how you'll argue it. Your counterargument is handled fairly and answered with evidence rather than opinion. Next step: ground your two conditions in local detail so the board can see what your plan would cost.",
        inlineComments: [
          {
            excerpt: 'but only if it redesigns bus routes and adjusts the athletic schedule',
            content:
              "This is the move. Your thesis sets conditions, so the reader knows exactly what you're arguing and what's coming.",
          },
          {
            excerpt: 'it adds up to almost three extra hours of sleep over a school week',
            content: 'Great reasoning: you translate the statistic into something the reader can feel.',
          },
          {
            excerpt: 'This concern deserves a real answer, because it sounds like common sense.',
            content:
              'Fair and generous to the other side before you answer it. This is what a strong counterargument looks like.',
          },
        ],
      },
    },
    {
      studentKey: 'sofia',
      title: 'The 6:15 Problem',
      submittedDaysAgo: 3,
      paragraphs: [
        "My alarm goes off at 6:15, and for the first thirty seconds I genuinely do not know what year it is. By 6:40 I am standing at the bus stop in the dark, holding a granola bar I will not eat, next to a sophomore who sleeps standing up. I am fairly sure he has perfected it. By 7:30 I am in Algebra II, where Mr. Patel is explaining logarithms to twenty-eight people doing their best impression of being awake. Members of the board, I am writing to ask you to move our start time to 8:30, because the version of me that shows up at 7:30 is not the student you are paying to teach.",
        "I want to be clear that this is not a complaint about being tired. Everyone is tired. This is about the fact that teenagers are tired on a schedule our bodies did not choose. During puberty, the internal clock that tells us when to sleep shifts later, sometimes by as much as two hours. It is not a lack of discipline; it is biology with a terrible sense of timing. That is why the American Academy of Pediatrics said in 2014 that middle and high schools should not start before 8:30. The doctors looked at the same sleepy faces I see every morning and decided the problem was the clock, not the kids.",
        "The best news is that we do not have to guess what would happen. In 2016, Seattle pushed its high school start time almost an hour later, and researchers measured the results. Students slept about 34 more minutes a night. Grades went up. First-period attendance improved, especially at a school in a lower-income neighborhood. Thirty-four minutes sounds small until you are the one getting them. It is the difference between reading the chapter and reading the same paragraph four times while the words slide off the page like rain off a windshield.",
        "I know the change is not free. The most serious objection I have heard is about families. Some parents rely on older siblings to meet younger kids at the bus in the afternoon, and others leave for work so early that an 8:30 start means a teenager alone at home for an hour. These are real problems, and I do not want to wave them away. But they are scheduling problems, and schedules can be redesigned. A district that can coordinate forty buses can coordinate an after-school program or a supervised early-arrival room in the library. My sleep, on the other hand, cannot be redesigned. I have tried. I have tried melatonin, no phones after ten, and a podcast about whales. My brain still wants to fall asleep at eleven.",
        "Athletes have a fair point too, since practice will run later and some away games may cut into class. But I would ask the board to think about who gets hurt most by the current schedule. It is not the student who loves 6 a.m. weights. It is the kid who works a closing shift, sleeps five hours, and drifts through first period wondering why school feels impossible. A later start does not solve everything, but it stops punishing the students who are already running on empty.",
        "Tomorrow my alarm will go off at 6:15 again. I will find my shoes, abandon my granola bar, and stand at the bus stop beside my sleeping friend. I am not asking you to make high school easy. I am asking you to schedule it for the people who actually attend it. Give us the hour. We will show up for it.",
      ],
      grade: {
        scores: {
          thesis_and_content: 4,
          organization_and_structure: 4,
          evidence_and_support: 4,
          voice_and_style: 5,
          grammar_and_mechanics: 4,
        },
        comments: {
          thesis_and_content:
            'Your position is clear and you sustain it right through your final line. To reach a 5, sharpen the claim in your opening so it previews your reasons, not just your request.',
          organization_and_structure:
            'The 6:15 frame that opens and closes the essay is a great structural choice. Your athletics paragraph feels slightly tacked on after the families paragraph; consider folding the two objections together.',
          evidence_and_support:
            'You use the AAP recommendation and the Seattle results accurately and efficiently. Naming who ran the Seattle study would make that paragraph more credible to a board audience.',
          voice_and_style:
            'This is the voice model for the class. The bus-stop opening, the varied sentence lengths, and the whale podcast all show a real person thinking, and you still keep the tone respectful for school board members.',
          grammar_and_mechanics:
            "Nearly clean, and your fragments ('Grades went up.') are clearly on purpose. Watch comma placement in a couple of your longest sentences.",
        },
        overallComment:
          'Your voice is the standout here: vivid, funny in the right places, and always in control of the argument. The opening and closing scenes make the board feel 6:15 before you ever cite a study. Next step: make your thesis do a little more work by naming the reasons you go on to develop.',
        inlineComments: [
          {
            excerpt: 'I am fairly sure he has perfected it.',
            content: "Ha. One dry sentence and I'm on your side. Perfect use of humor.",
          },
          {
            excerpt: 'It is not a lack of discipline; it is biology with a terrible sense of timing.',
            content: 'Precise word choice and a smart semicolon. This line will stick with your readers.',
          },
          {
            excerpt: 'I have tried melatonin, no phones after ten, and a podcast about whales.',
            content: "This answers the 'just go to bed earlier' objection with humor and evidence at once.",
          },
        ],
      },
    },
    {
      studentKey: 'marcus',
      title: 'Start Times: Looking at Both Sides',
      submittedDaysAgo: 2,
      paragraphs: [
        "At 7:30 in the morning, the hallways of our high school are quieter than at any other time of day. That is not because students are focused. It is because many of them are still half asleep. The district is now considering moving the start time to 8:30, and the decision has people on both sides with strong opinions. There are good arguments on both sides, and it depends on the school. In this essay I will look at the research, the costs, and the experiences of students to show why this is such a complicated question.",
        "The research on teenage sleep is hard to ignore. The American Academy of Pediatrics released a policy statement in 2014 recommending that middle and high schools start no earlier than 8:30 a.m. Their reasoning is that during puberty, the body's sleep cycle shifts later, so most teenagers are not able to fall asleep until around 11 p.m. If a student has to wake up at 6:00 to catch a bus, that leaves seven hours of sleep at best, while doctors say teens need eight to ten. According to the CDC, most middle and high schools in the United States still start before 8:30, which means millions of students are on a schedule that experts say is too early.",
        "There is also evidence from districts that have already made the change. In 2016, Seattle Public Schools moved its high school start time from 7:50 to 8:45. A study by researchers at the University of Washington found that students slept about 34 minutes longer on school nights after the change. The same study found that students' median grades in biology class went up by about 4.5 percent, and that first-period tardiness and absences went down, especially at a school in a lower-income neighborhood. These results show that a later start time can have real effects on how students do in school.",
        "On the other hand, changing the start time creates real problems for districts. Many districts run a tiered bus system, where the same buses drive high school students first and then go back out for middle and elementary students. Moving the high school start time can mean buying more buses or hiring more drivers, which some districts estimate would cost hundreds of thousands of dollars a year. Athletics are also affected. If school ends at 3:45 instead of 2:45, practices run later into the evening, and athletes may have to leave class early for away games. Students with after-school jobs could lose hours, and some families depend on teenagers to watch younger siblings in the afternoon.",
        "I can see both sides from my own experience. Last year I had first-period history, and I remember that half the class would put their heads down during the warm-up. At the same time, I play JV soccer, and our practices already end around 5:30. If they ended at 6:30, I would get home later and probably start my homework later, which might cancel out some of the extra sleep. My cousin goes to a school that starts at 8:15, and she says she likes it, but her school also has fewer buses and no football team.",
        "In conclusion, whether the school should start later is not a simple yes or no question. The research shows that teenagers need more sleep and that later start times can help, but the costs and the effects on sports and jobs are also important. Every school is different, and what worked in Seattle might not work everywhere. In the end, the district will have to weigh the benefits and the drawbacks and decide what is best for its own students.",
      ],
      grade: {
        scores: {
          thesis_and_content: 2,
          organization_and_structure: 4,
          evidence_and_support: 4,
          voice_and_style: 4,
          grammar_and_mechanics: 4,
        },
        comments: {
          thesis_and_content:
            "Your thesis, 'There are good arguments on both sides, and it depends on the school,' doesn't take a position, and your conclusion never commits either. The prompt asks you to argue for or against the change; right now the reader finishes without knowing what you think.",
          organization_and_structure:
            'Very well organized: research, a real-world example, costs, then your own experience, each in its own paragraph with a clear topic sentence. That structure is ready to carry a real claim.',
          evidence_and_support:
            "Some of the best evidence in the class: the AAP statement, the CDC data, and specific Seattle results. The problem is that it doesn't add up to anything yet, because there's no claim for it to support.",
          voice_and_style:
            "You sound like a thoughtful person, and the soccer and cousin details make it personal without losing focus. Cut 'In this essay I will' and let your ideas introduce themselves.",
          grammar_and_mechanics: 'Clean and correct throughout, with good control of longer sentences.',
        },
        overallComment:
          "You've done the hard part: you found strong, specific evidence and organized it clearly. What's missing is a position. Look at your own evidence, decide which side it really supports, and rewrite your thesis and conclusion to commit to it; your concerns about buses and sports could even become conditions in that thesis.",
        inlineComments: [
          {
            excerpt: 'There are good arguments on both sides, and it depends on the school.',
            content: 'This is where you need to take a stand. Which side does your own evidence support?',
          },
          {
            excerpt: "students' median grades in biology class went up by about 4.5 percent",
            content:
              'Specific, accurate, and well cited. This is strong evidence for a later start, so let it drive your claim.',
          },
          {
            excerpt: 'the district will have to weigh the benefits and the drawbacks and decide',
            content: "You've already weighed them for us. Tell the board what you decided.",
          },
        ],
      },
    },
    {
      studentKey: 'maya',
      title: 'The Importance of a Later School Start Time',
      submittedDaysAgo: 3,
      paragraphs: [
        "In today's society, sleep is an important issue that affects many students. It is important to note that teenagers are not getting enough sleep on school nights. It is also important to note that early school start times are one of the main causes of this problem. Our district is currently considering whether to change the high school start time from 7:30 a.m. to 8:30 a.m. The district should move the start time to 8:30 a.m. because the change is supported by medical experts, it has improved results in other districts, and its drawbacks can be managed.",
        "First of all, the change is supported by medical experts. It is important to note that the American Academy of Pediatrics published a policy statement in 2014. The policy statement recommended that middle schools and high schools begin no earlier than 8:30 a.m. The reason for this recommendation is that adolescents experience a shift in their circadian rhythm during puberty. This shift causes adolescents to fall asleep later in the evening. This shift also causes adolescents to need to wake up later in the morning. Furthermore, the Centers for Disease Control and Prevention has reported that the majority of middle and high schools in the United States begin before 8:30 a.m. Therefore, it can be concluded that most schools do not follow the recommendation of medical experts.",
        "Second of all, the change has improved results in other districts. In 2016, the Seattle Public Schools district changed its high school start time from 7:50 a.m. to 8:45 a.m. Researchers from the University of Washington conducted a study regarding the effects of this change. The study found that students obtained approximately 34 additional minutes of sleep per night. The study also found that the grades of students increased. The study also found that the number of tardies and absences in first period decreased. In addition, these improvements were the greatest at a school with a higher number of low-income students. Therefore, it can be concluded that a later start time has a positive effect on the academic performance of students.",
        "Third of all, the drawbacks of the change can be managed. Some people believe that a later start time will cause problems with transportation, athletics, and after-school employment. It is important to note that these concerns are valid. However, it is also important to note that these concerns can be addressed. For example, the district can adjust the bus schedule so that the high school route runs after the elementary route. For example, athletic events can be scheduled at a later time. For example, students who have jobs can work on weekends. Some people also believe that students will simply go to sleep later if school starts later. However, the study in Seattle found that the bedtimes of students remained approximately the same. Therefore, it can be concluded that the drawbacks of the change are not a sufficient reason to reject the change.",
        "In conclusion, the district should change the high school start time to 8:30 a.m. This change is supported by medical experts. This change has improved results in other districts. This change has drawbacks that can be managed. In today's society, it is important for students to receive an adequate amount of sleep in order to be successful. It is important to note that a later start time is a beneficial solution to this problem. Therefore, the district should implement this change for the benefit of all students.",
      ],
      grade: {
        scores: {
          thesis_and_content: 4,
          organization_and_structure: 4,
          evidence_and_support: 4,
          voice_and_style: 2,
          grammar_and_mechanics: 4,
        },
        comments: {
          thesis_and_content:
            'Your thesis is clear, takes a side, and previews three reasons, and every paragraph supports it. Nicely done.',
          organization_and_structure:
            "Logical and easy to follow; each body paragraph matches one reason from your thesis. Your transitions ('First of all,' 'Second of all,' 'Third of all') work but feel mechanical.",
          evidence_and_support:
            'Strong, accurate evidence from the AAP, the CDC, and the Seattle study, and you answer the stay-up-later objection with data. Push further by explaining what the evidence means instead of restating it.',
          voice_and_style:
            "This is the area to work on. Phrases like 'In today's society' and 'it is important to note that' fill space without adding meaning, and so many sentences start the same way that the essay doesn't sound like you. I know you have opinions about 7:30 mornings; let me hear them.",
          grammar_and_mechanics:
            'Correct and careful throughout. Your grammar is strong; now let your sentences vary in length and shape.',
        },
        overallComment:
          "Your argument is solid: a clear thesis, logical structure, and good evidence. What holds it back is a voice so stiff and formulaic that the reader loses the person behind the argument. Next step: cut every 'it is important to note,' replace your opening sentence with a specific moment from your own mornings, and vary how your sentences begin.",
        inlineComments: [
          {
            excerpt: "In today's society, sleep is an important issue that affects many students.",
            content: "A canned opener. What's a specific, real moment that shows the problem instead?",
          },
          {
            excerpt: 'The study also found that the grades of students increased.',
            content:
              "Three 'The study found' sentences in a row. Combine them into one sentence with some energy.",
          },
          {
            excerpt: 'For example, athletic events can be scheduled at a later time.',
            content:
              "Repeating 'For example' makes this read like a list. How would you say this out loud to the board?",
          },
        ],
      },
    },
    {
      studentKey: 'daniel',
      title: 'Why School Should Start Later',
      submittedDaysAgo: 1,
      paragraphs: [
        "Most students at our school would agree that 7:30 is way too early to start school. A lot of kids come to first period tired and can't pay attention. The district is thinking about changing the start time to 8:30. I think the school should start later because students need more sleep, it will help their grades, and it will make students happier.",
        "The first reason school should start later is that students need more sleep. Doctors say that teenagers need around 8 to 10 hours of sleep every night. Most teenagers do not get that much sleep because they have to wake up so early. Right now I usually wake up around 6:00 and go to bed around 11:00, so I only get about 7 hours. The American Academy of Pediatrics said that high schools should not start before 8:30. If school started at 8:30, students could sleep an extra hour. This would help them be more awake during the day.",
        "The second reason is that it will help students' grades. When students are tired they don't do as well on tests and they don't pay attention in class. Being tired also makes it harder to remember what you studied the night before. I read that a school district in Seattle changed to a later start time and students got better grades. If students are more awake they will learn more and do better on their homework and tests. This shows that a later start time is good for grades.",
        "The third reason is that it will make students happier. When I don't get enough sleep I am grumpy and I don't want to talk to anybody. A lot of my friends say the same thing. If students got more sleep, they would be in a better mood and there would probably be less drama at school. Teachers would also be happier because their students would be paying attention instead of falling asleep.",
        "Some people say that starting school later would be bad because sports practice would end later and students would get home late. This is true, but I think sleep is more important than sports. Also, students could just do their homework earlier or go to bed right after practice. Other people say that the buses would cost more money, but the district should spend money on things that help students.",
        "In conclusion, the school should start later at 8:30. Students need more sleep, it will help their grades, and it will make everyone happier. Starting at 7:30 is just too early for teenagers. The district should make the change so students can do their best in school.",
      ],
      grade: {
        scores: {
          thesis_and_content: 3,
          organization_and_structure: 3,
          evidence_and_support: 3,
          voice_and_style: 3,
          grammar_and_mechanics: 3,
        },
        comments: {
          thesis_and_content:
            "Your thesis is clear and gives three reasons, but the reasons are general. 'It will make students happier' is hard to prove and weaker than your first two.",
          organization_and_structure:
            'A five-paragraph structure that is easy to follow. Your paragraphs sit side by side rather than build; try a transition that connects one reason to the next.',
          evidence_and_support:
            'Good that you mention the AAP and Seattle, but you need specifics: what exactly happened in Seattle? Your happiness paragraph relies only on your own experience.',
          voice_and_style:
            "Your voice is clear and honest, especially when you describe being grumpy. It gets repetitive with 'The first reason... The second reason... The third reason.'",
          grammar_and_mechanics:
            "Mostly correct. Add commas after introductory clauses, like 'When students are tired, they don't do as well.'",
        },
        overallComment:
          "You take a clear side and organize your reasons well. The next step is to deepen your reasoning: for each reason, add a specific fact and explain why it matters. Your counterargument also needs a stronger answer than 'sleep is more important than sports.'",
        inlineComments: [
          {
            excerpt: 'I read that a school district in Seattle changed to a later start time',
            content:
              'Good instinct. What did you read? Give the numbers: how much more sleep, and how much did grades change?',
          },
          {
            excerpt: 'This is true, but I think sleep is more important than sports.',
            content: 'This is an opinion, not an answer. Why is it more important, and for whom?',
          },
        ],
      },
    },
    {
      studentKey: 'priya',
      title: 'A Later Start for a Better School Day',
      submittedDaysAgo: 2,
      paragraphs: [
        "School start times are a big topic in many districts right now, and our district is no different. The school board is deciding whether to move the high school start time from 7:30 to 8:30. After thinking about both sides, I believe that starting school later would be better for students in many ways.",
        "To begin with, a later start would help students' health. Teenagers need a lot of sleep, and many experts agree that most teens do not get enough. Studies have shown that a lack of sleep can lead to problems such as stress, trouble concentrating, and even getting sick more often. When school starts at 7:30, many students have to wake up before 6:00 to get ready and catch the bus. The American Academy of Pediatrics even recommends that high schools start later for this reason. An extra hour in the morning would give students a chance to rest and start the day feeling healthier.",
        "In addition, a later start would help students learn. It is hard to focus on a math test or a class discussion when you are exhausted. Many teachers have noticed that their first-period classes are quieter and less engaged than their afternoon classes. Research has found that schools with later start times often see better grades and attendance. If students are more alert, they will be able to participate more and get more out of each class.",
        "Finally, a later start could improve the overall atmosphere at school. Tired students are more likely to be irritable, and small problems can turn into bigger conflicts. When students are well rested, they tend to be more patient with each other and with their teachers. Fewer students would also be late to first period, which means fewer interruptions for the whole class. A calmer school environment would benefit everyone, not just the students who are the most tired.",
        "Some people argue that a later start time would cause problems for after-school activities. For example, sports practices would end later, and students with jobs might not be able to work as many hours. These are fair concerns. However, schools could adjust practice schedules, and many jobs offer evening and weekend shifts. The benefits to students' health and learning are more important than these scheduling challenges.",
        "In conclusion, moving the start time from 7:30 to 8:30 would be a positive change for our school. It would help students' health, improve their learning, and create a better atmosphere. While there are some challenges, they can be solved with planning. The school board should vote to start school later.",
      ],
      grade: {
        scores: {
          thesis_and_content: 3,
          organization_and_structure: 4,
          evidence_and_support: 3,
          voice_and_style: 3,
          grammar_and_mechanics: 4,
        },
        comments: {
          thesis_and_content:
            "Your thesis takes a side, but 'better for students in many ways' is broad. Name the ways in the thesis so the reader knows your argument from the start.",
          organization_and_structure:
            'Very tidy: clear topic sentences, smooth transitions, and a counterargument placed right where it belongs.',
          evidence_and_support:
            "Your evidence is mostly general ('Research has found,' 'many experts agree'). Name the research; the Seattle study or the AAP's 2014 statement would make paragraphs 2 and 3 much stronger.",
          voice_and_style:
            'Clear and polite, though fairly neutral. A specific detail from your own mornings would make this sound more like you.',
          grammar_and_mechanics: 'Clean and correct, with good sentence control.',
        },
        overallComment:
          "This is an organized, readable essay with a clear position. Its biggest limit is how general it is, in both the thesis and the evidence. Next step: replace each 'studies show' with a named source and a number.",
        inlineComments: [
          {
            excerpt: 'starting school later would be better for students in many ways',
            content: 'Which ways? Previewing your three reasons here would sharpen this thesis.',
          },
          {
            excerpt: 'Research has found that schools with later start times often see better grades',
            content: 'What research? Name a study or a district so the reader can trust this.',
          },
        ],
      },
    },
    {
      studentKey: 'hannah',
      title: 'School Start Times',
      submittedDaysAgo: 1,
      paragraphs: [
        "The district is thinking about changing the high school start time from 7:30 to 8:30. Many students at our school are tired in the morning, and I am one of them. I think that starting school later is a good idea. There is a lot of research about this topic.",
        "The American Academy of Pediatrics published a policy statement in 2014 called School Start Times for Adolescents. In it, they recommended that middle and high schools start at 8:30 a.m. or later. They said that teenagers need 8.5 to 9.5 hours of sleep each night. They also said that during puberty, there is a shift in teenagers' circadian rhythm, which means their bodies start producing melatonin later at night. Because of this, most teenagers can't fall asleep before about 11:00 p.m. The AAP called insufficient sleep in adolescents an important public health issue.",
        "The CDC also did research on this. In a report, the CDC found that most public middle and high schools in the United States start before 8:30 a.m. The report said that the average start time was around 8:03 a.m. The CDC also said that students who don't get enough sleep are more likely to be overweight, have symptoms of depression, and do poorly in school. They are also more likely to do risky things like drink alcohol or use drugs. Driving while drowsy is another risk for students who drive to school.",
        "Another example is Seattle. In 2016, Seattle Public Schools changed the high school start time from 7:50 a.m. to 8:45 a.m. Scientists from the University of Washington studied students at two high schools. They had students wear wrist monitors that tracked their sleep. They found that students got about 34 more minutes of sleep each night after the change. Students' grades in their biology class also went up by 4.5 percent, and there were fewer tardies and absences. The study was published in the journal Science Advances in 2018.",
        "There are also some problems with starting school later. Buses might cost more money, and sports practices would end later. Some students have jobs after school. Also some parents need their teenagers to watch their younger brothers and sisters after school. But I think the benefits are more important than these problems. Students need sleep to do well in school.",
        "In conclusion, starting school later is a good idea. The AAP, the CDC, and the Seattle study all show that teenagers need more sleep and that later start times can help. The district should change the start time to 8:30.",
      ],
      grade: {
        scores: {
          thesis_and_content: 3,
          organization_and_structure: 3,
          evidence_and_support: 4,
          voice_and_style: 3,
          grammar_and_mechanics: 3,
        },
        comments: {
          thesis_and_content:
            "'Starting school later is a good idea' is a position, but it's generic. Your research is strong enough to support a sharper claim about why and for whom.",
          organization_and_structure:
            'Your research paragraphs are clearly separated by source, but the essay reads more like a report than an argument. The counterargument paragraph is short and arrives without a transition.',
          evidence_and_support:
            "Excellent research. The AAP statement, the CDC's 8:03 average, and the details of the Seattle wrist-monitor study are specific and accurate. Now explain how each one supports your claim.",
          voice_and_style:
            'Plain and clear, but it mostly sounds like a summary of sources. Let your own perspective show, especially in the intro and conclusion.',
          grammar_and_mechanics:
            "Generally correct. Many sentences start with 'They' or 'The CDC also'; vary them, and watch for missing commas, like after 'Also' in paragraph 5.",
        },
        overallComment:
          'You did some of the most thorough research in the class, and your details are accurate. The next step is to turn that research into an argument: write a thesis that makes a specific claim, then follow each fact with a sentence explaining why it matters for our school.',
        inlineComments: [
          {
            excerpt: 'I think that starting school later is a good idea.',
            content: 'A good idea why? Your research gives you a sharper claim; use it here.',
          },
          {
            excerpt: 'They had students wear wrist monitors that tracked their sleep.',
            content: 'Great detail. It shows the study measured sleep instead of just asking students.',
          },
          {
            excerpt: 'But I think the benefits are more important than these problems.',
            content: 'Why? This counterargument needs evidence and explanation, just like your body paragraphs.',
          },
        ],
      },
    },
    {
      studentKey: 'ethan',
      title: 'Why I Hate Mornings',
      submittedDaysAgo: 1,
      paragraphs: [
        "So the school wants to maybe change school to start at 8:30 instead of 7:30. Theres alot of people who have opinions about this like my mom says its a bad idea because she has to drop off my little brother but I dont really know what she means because he goes to a different school anyway.",
        "Last week I was so tired in first period that I fell asleep in biology and Mrs. Grant had to wake me up and everybody laughed and it was really embarassing, I had stayed up kind of late because me and my friend were playing a game and we were trying to beat this one level and it took forever, then I had to get up at 6 to get the bus which comes really early like before its even light out. My dad says I should just go to bed earlier but its not that easy when your not even tired.",
        "Alot of kids are tired in the morning not just me. Theres this one kid who always has his hood up and sleeps every day. I think its because teenagers need more sleep then adults do I heard that somewhere. If we had school later than everybody would be more awake and they would learn more stuff and not get in trouble for sleeping.",
        "But some people think it would be bad because of sports. My friend plays football and he says practice would go until like 7 and then he wont get home until late and he has homework. Also buses. I dont know alot about the buses but my mom says it costs money. So theres good and bad things about it.",
        "Overall I think school should start later because people are tired and its hard to learn when your tired. Even if theres some problems it would still be better for most people. Thats why I think the school should start at 8:30.",
      ],
      grade: {
        scores: {
          thesis_and_content: 2,
          organization_and_structure: 2,
          evidence_and_support: 2,
          voice_and_style: 2,
          grammar_and_mechanics: 2,
        },
        comments: {
          thesis_and_content:
            "Your position doesn't appear until the very end. Put 'school should start later because...' in your first paragraph so the reader knows what you're arguing.",
          organization_and_structure:
            'The essay jumps between your mom, your biology nap, and football without clear topic sentences. Try giving each paragraph one main point.',
          evidence_and_support:
            "Your biology story is a start, but the essay needs facts. You wrote 'I heard that somewhere'; find that source (the American Academy of Pediatrics has a good one) and cite it.",
          voice_and_style:
            'Your honesty comes through and I enjoyed the biology story. The tone is very casual for an argument meant for the school board.',
          grammar_and_mechanics:
            "Several run-on sentences and missing apostrophes (its/it's, your/you're, theres/there's). Read your second paragraph aloud and add a period wherever you take a breath.",
        },
        overallComment:
          "I can tell you care about this issue, and your personal story shows why it matters. The biggest next step is to state your position in the first paragraph and back it up with at least one real source. Let's meet to work on breaking up run-on sentences.",
        inlineComments: [
          {
            excerpt: 'I dont really know what she means because he goes to a different school anyway',
            content:
              "Your intro should tell me your position. Save your mom's concern for a counterargument paragraph.",
          },
          {
            excerpt: 'teenagers need more sleep then adults do I heard that somewhere',
            content: "This is your best point! Find the source, and fix the run-on ('than,' then a period).",
          },
          {
            excerpt: 'Thats why I think the school should start at 8:30.',
            content: "Here's your thesis! Move it up to your first paragraph.",
          },
        ],
      },
    },
    {
      studentKey: 'jonah',
      title: 'Keep the Bell at 7:30',
      submittedDaysAgo: 1,
      paragraphs: [
        "Everyone talks about how tired teenagers are, and I get it. But moving our start time to 8:30 would cause more problems than it solves. For students who play sports or have jobs after school, a later start would just move the tiredness to the other end of the day. I think the district should keep the start time at 7:30.",
        "The biggest problem is sports. I play baseball, and in the spring we have games on weekdays against schools that are sometimes an hour away. Right now we leave during last period. If school ended an hour later, we would have to miss even more class to get to games on time. Practice would also go later, and in the fall it gets dark around 6:30, so outdoor teams like soccer and football would lose practice time or need lights, which cost money. Our school does not even have lights on the baseball field.",
        "The second problem is jobs. A lot of students at our school work after school at places like grocery stores and restaurants. Some of them help their families pay bills. If school gets out at 3:15 instead of 2:15, they lose an hour of work every day, which is about five hours a week. That could be a lot of money for some families. My older brother worked at the pizza place down the street all through high school, and he said his manager would not have hired him if he could not start by 2:45.",
        "There is also the issue of younger kids. If the high school starts later, the district might have to switch the bus schedule so elementary schools start earlier. That would mean little kids waiting for buses in the dark. Some parents also count on their high schoolers to get home and watch their younger siblings, and that would be harder with a later dismissal.",
        "People who want the change say teenagers need more sleep and that the American Academy of Pediatrics recommends starting at 8:30. I agree that sleep is important. But a lot of students would probably just stay up later if they knew they could sleep in. If they want more sleep, they could go to bed earlier and put their phones away. That is a personal choice, and it should not be the whole district's problem.",
        "In conclusion, starting school later sounds good, but it would hurt athletes, students with jobs, and families. The district should keep the 7:30 start time and look for other ways to help students get more sleep, like less homework or teaching students about better sleep habits.",
      ],
    },
    {
      studentKey: 'theo',
      title: 'Let Us Sleep!!',
      submittedDaysAgo: 1,
      paragraphs: [
        "Okay so honestly 7:30 is way too early for school and I think pretty much everyone agrees with me on this one. Who decided that teenagers should be learning chemistry before the sun is even up? Not me thats for sure. Our school should totally start at 8:30 because we would actually be awake.",
        "Like seriously, have you ever looked around a classroom at 7:30 in the morning? Its like a zombie movie. Half the people have their heads down and the other half are just staring at the wall. My friend Dev literally fell asleep standing up in the lunch line once (okay that was at lunch but still). Teenagers need like 9 hours of sleep and theres no way we get that when we have to be up at 6.",
        "Also I saw a video that said teenagers' brains are actually wired to stay up later, so its not even our fault. Its like a science thing with your body clock. Doctors even said schools should start at 8:30 or later. So if doctors say it then why are we still starting at 7:30??",
        "Some people are gonna say what about sports. And yeah practice would end later, but honestly I'd rather practice at 4 when I'm awake than sit through first period half dead. And people say the buses would cost more money but the school wastes money on other stuff all the time, like the new sign out front that nobody asked for.",
        "Another thing is that kids who get more sleep are in a better mood. When I sleep like 5 hours I'm super cranky and I snap at my mom for no reason. If everybody got more sleep there'd be way less fights and people would be nicer to teachers. Teachers would probably like it too because they could sleep in also.",
        "So basically the school should start at 8:30. We'd be more awake, we'd learn more, and everybody would be happier. Its not that hard. Just let us sleep!",
      ],
    },
  ],
};
