/**
 * Synthetic paired-eval corpus for the AI PII redaction A/B harness.
 *
 * Every essay here is authored for this eval — none of it is real student
 * work and none of it was pulled from the LlmLog table or any other
 * production data source (explicit product decision, not an oversight; see
 * the eval brief). Names are invented and not meant to resemble any real
 * person.
 *
 * `studentFullName` feeds `firstNameFromFullName` exactly as the real route
 * does — only the first name is redacted/pseudonymized, matching
 * production behavior.
 */
export interface CorpusCase {
  id: string;
  band: 'strong' | 'mid' | 'weak';
  studentFullName: string;
  note: string;
  essayText: string;
}

export const corpus: CorpusCase[] = [
  {
    id: 'E01-strong-tech-optimism',
    band: 'strong',
    studentFullName: 'Amelia Chen',
    note: 'Strong writing: sharp thesis, sustained analysis, original conclusion.',
    essayText: `We are told, again and again, that technology is inevitable progress -- that each new device is a rung on a ladder climbing toward some better future. I want to argue the opposite: technology is not a ladder but a mirror, and what it reflects back is whatever we were already becoming. The smartphone did not invent our distraction; it found the seam in our attention that already existed and pried it open. The algorithm did not invent our tribalism; it discovered which grievances we would click on and served us more.

Consider the printing press, which we celebrate as an engine of enlightenment. It was also, within decades, an engine of religious war, spreading pamphlets that turned neighbor against neighbor across Europe. The press did not choose enlightenment over conflict. It amplified both, because both were already latent in the culture that received it. We remember the enlightenment because it is the story we prefer to tell about ourselves.

This is why I am suspicious of both technological optimism and technological doom. Neither treats us as agents. The optimist assumes the tool will save us from ourselves; the pessimist assumes it will damn us. Both let us off the hook. If technology is a mirror, then the only progress worth trusting is the kind we build into ourselves first -- the discipline, the empathy, the skepticism -- and then hand to our tools, rather than the reverse. We do not need better machines nearly so urgently as we need to become people worth reflecting.`,
  },
  {
    id: 'E02-weak-social-media',
    band: 'weak',
    studentFullName: 'Marcus Webb',
    note: 'Weak writing: thin thesis, no real structure, generic claims.',
    essayText: `Social media is bad for teenagers. There are many reasons why. First of all it is very addicting and kids spend to much time on it instead of doing homework. Also it can make people feel bad about themselves because they see other people who look perfect and they compare themselves. This is not good for self esteem.

Another reason is cyberbullying. People say mean things online that they would not say in person because they are hiding behind a screen. This happens a lot and it hurts peoples feelings.

Also social media companies just want your data and your attention so they make the apps addicting on purpose which is not fair to kids who dont know better.

In conclusion social media has some good things but mostly its bad for teenagers and something should probably be done about it like maybe age limits or something. Parents should also watch what there kids are doing online more.`,
  },
  {
    id: 'E03-mid-climate-policy',
    band: 'mid',
    studentFullName: 'Priya Patel',
    note: 'Mid-range writing: competent five-paragraph structure, adequate but unremarkable analysis.',
    essayText: `Climate change is one of the most important issues facing our generation, and a national carbon tax is one of the most effective tools we have to address it. By putting a direct price on carbon emissions, a carbon tax gives businesses a clear financial incentive to reduce their pollution, while also generating revenue that can be reinvested in clean energy infrastructure.

Critics argue that a carbon tax would raise costs for low-income families who already spend a large share of their income on energy and transportation. This is a fair concern, but it can be addressed through a "carbon dividend" model, where the revenue collected is returned directly to citizens as a rebate. Several economists have proposed exactly this structure, and studies suggest it could leave most low- and middle-income households financially better off.

Some also worry that a carbon tax alone will not be enough to meet emissions targets, and they are probably right. A carbon tax should be one part of a broader policy package that includes investment in public transit, stricter building codes, and support for renewable energy research.

In conclusion, while a carbon tax is not a perfect solution, it is a practical and economically sound first step. Combined with a dividend system to protect vulnerable families, it represents a policy that could meaningfully reduce emissions without placing unfair burdens on ordinary citizens.`,
  },
  {
    id: 'E04-strong-name-in-body',
    band: 'strong',
    studentFullName: 'Sophia Marín',
    note: 'Key edge case: the essay text names the author directly and closes with a signature -- tests whether redaction leaks or garbles the essay body itself.',
    essayText: `My name is Sophia, and for most of my childhood I believed silence was a kind of strength. My grandmother, who raised me for three years while my parents worked abroad, spoke maybe twenty words a day, and I mistook her quiet for wisdom rather than exhaustion. It was only years later, reading her old letters after she passed, that I understood how much she had wanted to say and how rarely anyone had asked.

That discovery changed how I write. Every essay I have turned in since has been an argument against my own inherited silence -- a refusal to let the important things go unsaid simply because saying them is uncomfortable. When I write about my family, I try to name what actually happened instead of the softened version we tell at dinner. When I write about my own mistakes, I resist the urge to bury them in a paragraph about "growth" and instead describe the mistake itself, plainly, so a reader can see it clearly.

I do not think this makes me brave. I think it makes me late -- late to a kind of honesty my grandmother never had room for. But I would rather arrive late than not arrive at all.

-- Sophia`,
  },
  {
    id: 'E05-mid-shared-name-maya-thompson',
    band: 'mid',
    studentFullName: 'Maya Thompson',
    note: 'Shared-first-name pair (A): tests that two students named Maya map to the same pseudonym.',
    essayText: `Growing up between two languages taught me that translation is never really complete. When my mother told me stories in Gujarati, certain words simply had no English equivalent -- a particular kind of homesickness, a specific warmth between cousins -- and I would sit with the gap rather than fill it badly.

I used to think this made me less fluent than my English-only classmates. Now I think it made me a more careful listener. When a word does not translate cleanly, you have to ask what it is actually pointing at, rather than assuming you already know. That habit has followed me into how I read literature and even how I argue with people I disagree with: I try to ask what they mean before deciding whether I agree.

This essay is not really about bilingualism. It is about the discipline of not assuming you already understand something just because you have heard something similar before. That discipline is harder to practice than it sounds, and I am still learning it.`,
  },
  {
    id: 'E06-strong-shared-name-maya-obrien',
    band: 'strong',
    studentFullName: "Maya O'Brien",
    note: "Shared-first-name pair (B): second student named Maya, different essay/topic, tests deterministic shared pseudonym across two separate requests.",
    essayText: `Every ethics course I have taken treats artificial intelligence as a future problem -- something to legislate once the technology "matures." I want to argue that this framing is already obsolete, and that treating AI ethics as a policy question we can defer is itself an ethical failure happening right now.

Consider a hiring algorithm trained on a decade of a company's past hiring decisions. If those decisions were shaped by bias, however unintentional, the algorithm will not correct for that bias -- it will formalize it, encode it into weights, and apply it at a scale no individual biased manager ever could. The harm is not hypothetical or futuristic. It is happening in the training data we already have.

The uncomfortable truth is that AI ethics is not primarily a technology problem. It is an audit problem: an obligation to examine the historical data we feed these systems with the same scrutiny we would apply to a biased employee, except the "employee" now makes ten thousand decisions a second and cannot be pulled aside for a conversation.

Waiting for better regulation before addressing this is not caution. It is a way of avoiding the harder work of examining what our own institutional histories already contain.`,
  },
  {
    id: 'E07-mid-pseudonym-pool-collision',
    band: 'mid',
    studentFullName: 'Logan Fitzgerald',
    note: "Edge case: the student's real first name (Logan) is itself an entry in PSEUDONYM_FIRST_NAME_POOL -- exercises the never-reuse-a-real-name-as-a-pseudonym collision guard in mapping.server.ts.",
    essayText: `Standardized testing is often criticized as an unfair measure of intelligence, and I agree that it is an imperfect one -- but I think the more useful question is not whether the SAT is unfair (it is, in several well-documented ways) but whether we have a fairer alternative on the table. So far, the answer is mostly no.

Portfolio-based admissions, which several schools have piloted as an alternative, sound appealing but introduce their own bias: they favor students with time, resources, and mentorship to build an impressive portfolio, which correlates just as strongly with family income as test prep does. Holistic review, which most selective colleges already use alongside test scores, is more subjective, not less, and subjectivity has its own long history of favoring applicants who resemble the reviewers.

None of this is an argument for keeping the SAT exactly as it is. It is an argument for being honest that removing a flawed, quantifiable measure in favor of vaguer criteria does not automatically produce a fairer process -- it can just make the unfairness harder to see and harder to challenge. If we are going to reform admissions, we should reform toward more transparency, not less, even if that means keeping an imperfect test in the mix while we build something better.`,
  },
  {
    id: 'E08-strong-gatsby-symbolism',
    band: 'strong',
    studentFullName: 'Ethan Brooks',
    note: 'Strong literary analysis with textual specificity.',
    essayText: `The green light at the end of Daisy's dock is usually read as a symbol of Gatsby's hope, and that reading is not wrong so much as incomplete. Fitzgerald is careful to show us the light twice: once through Nick's eyes as Gatsby reaches toward it "trembling," and once, after Gatsby's death, as Nick reflects that it represented "the orgastic future that year by year recedes before us." The symbol does not stay still. It moves from a private, almost embarrassing gesture of longing to a diagnosis of an entire national temperament.

That shift matters because it reframes Gatsby's failure as something larger than one man's romantic delusion. If the green light only meant Daisy, Gatsby's death would be a private tragedy -- a man who loved the wrong woman too much. But Nick's final meditation extends the light outward to "the fresh, green breast of the new world" that the Dutch sailors once saw, tying Gatsby's hope directly to the American origin myth of endless, available future.

Read this way, Gatsby is not a cautionary tale about one man's excess. He is Fitzgerald's argument that the entire American promise of self-reinvention runs on the same fuel as Gatsby's doomed hope: a light that recedes exactly as fast as we row toward it.`,
  },
  {
    id: 'E09-weak-short-off-topic',
    band: 'weak',
    studentFullName: 'Destiny Rivera',
    note: 'Weak/short: barely on-topic, minimal development, tests the low end of the scoring band.',
    essayText: `School uniforms are dumb honestly. I dont think schools should make us wear them. Its our choice what we wear and uniforms dont let us express ourselves. Also they cost money and some families cant afford new ones every year.

Some people say uniforms stop bullying about clothes but I dont really think that true because kids will just find other stuff to make fun of like shoes or backpacks.

Basically uniforms dont fix anything they just make school more boring and everyone looks the same which is not fun. Schools should let us wear what we want as long as its appropriate.`,
  },
  {
    id: 'E10-mid-renewable-subsidies',
    band: 'mid',
    studentFullName: 'Omar Haddad',
    note: 'Mid-range persuasive essay, adequate structure and evidence.',
    essayText: `Government subsidies for renewable energy are a necessary investment, not a handout. Solar and wind power have become dramatically cheaper over the past decade, but they still compete against fossil fuel industries that have received subsidies for over a century and have built infrastructure to match. Without comparable support, renewables are not competing on a level playing field.

Opponents of subsidies argue that the market should decide which energy sources succeed without government interference. This argument ignores that fossil fuels already benefit from an enormous hidden subsidy: the cost of the pollution they produce is not priced into the fuel itself but is instead paid later through healthcare costs and climate damage. In that sense, renewable subsidies do not distort the market so much as partially correct for a distortion that already exists.

That said, subsidies should not be permanent or unconditional. They should be structured to phase out as specific technologies become cost-competitive on their own, so that support goes toward genuine innovation rather than propping up companies indefinitely.

Overall, renewable energy subsidies are best understood as a temporary correction to an uneven playing field, not a permanent government thumb on the scale, and they remain one of the more defensible uses of public investment available to us today.`,
  },
  {
    id: 'E11-strong-beloved-quotes',
    band: 'strong',
    studentFullName: 'Naomi Ito',
    note: 'Strong essay with heavy, well-integrated textual evidence -- tests groundedness/specificity retention.',
    essayText: `Toni Morrison's Beloved refuses to let memory function as simple narration. When Sethe describes "rememory" to Denver -- explaining that "someday you be walking down the road and you hear something or see something going on... and you think it's you thinking it up. A thought picture. But no. It's when you bump into a rememory that belongs to somebody else" -- Morrison is proposing a theory of trauma that is spatial rather than psychological. Memory, in this novel, is not something that lives inside a single person's head. It is something that can still be standing in a place, waiting.

This has direct consequences for how the novel is structured. The narrative does not move chronologically because rememory does not move chronologically; it "bumps into" the reader the same way it bumps into Sethe. When the text circles back, again and again, to the events at Sweet Home, it is not repetition for emphasis -- it is enacting the very phenomenon Sethe describes, where the past refuses to stay past.

Beloved herself, as a character, is the most literal embodiment of this idea: a rememory made flesh, "coming back" not as metaphor but as a body demanding to be fed, housed, and finally exorcised. Morrison is not asking us to interpret trauma as a symbol. She is asking us to treat it as a physical fact that occupies space -- which is precisely why the novel cannot resolve until Sethe's community physically, collectively, drives Beloved out.`,
  },
  {
    id: 'E12-weak-grammar-heavy',
    band: 'weak',
    studentFullName: 'Tyler Brooks',
    note: 'Weak, heavy grammar/mechanics errors; tests whether the grammar-heavy signal stays consistent across control and treatment.',
    essayText: `Alot of teenager have part time jobs and i think its a good thing. it teach responsibility and time managment. when you have a job you have to show up on time and do what your told even if you dont want to, this is a important skill for later in life.

also having a job give you your own money so you dont have to ask your parents for everything all the time, this make you more independant. Some people say jobs take away from school work and thats true sometimes but if you manage your time good it dont have to be a problem.

In my opinion the good outweighs the bad, teenagers should get part time jobs if they can, it help them grow up and learn skills that school dont really teach like dealing with customers or a boss who is difficult sometimes.`,
  },
  {
    id: 'E13-mid-overcoming-failure',
    band: 'mid',
    studentFullName: 'Ava Whitfield',
    note: 'Mid-range personal narrative, reflective but somewhat generic conclusion.',
    essayText: `The first time I failed a test, I cried in the school bathroom for twenty minutes before pulling myself together and walking to my next class as if nothing had happened. I had never failed anything before, and I did not have a script for what to do with that feeling.

Looking back, what strikes me most is not the failure itself but how much energy I spent hiding it. I told my friends the test was "harder than expected" instead of admitting I hadn't understood the material. I told my parents a partial truth about the grade. All of that hiding took more effort than it would have taken to simply ask my teacher for help, which is what I eventually did, three weeks later than I should have.

That delay taught me something about pride that I still think about: the instinct to protect your image in the moment often costs you more time and stress than the original failure would have. Since then, I have tried to ask for help earlier, even when it is uncomfortable, because I would rather feel embarrassed for five minutes than stuck for three weeks.

I am not saying I have fully overcome that instinct to hide. I am saying I notice it faster now, and noticing it is the first step toward doing something different.`,
  },
  {
    id: 'E14-strong-ubi-counterargument',
    band: 'strong',
    studentFullName: 'Diego Morales',
    note: 'Strong argumentative essay that explicitly engages and rebuts a counterargument.',
    essayText: `The strongest objection to universal basic income is not that it is unaffordable -- serious economists disagree about the numbers, but the disagreement is at least a technical one that can be modeled. The strongest objection is that UBI would reduce the incentive to work, and that a society where fewer people work is a poorer, less dynamic society. This objection deserves to be taken seriously rather than dismissed, because it is not obviously wrong.

But the available evidence complicates it considerably. The negative income tax experiments run in the United States and Canada in the 1970s, along with more recent pilots in Finland and Kenya, found only modest reductions in work hours, concentrated almost entirely among new mothers and teenagers extending their education -- outcomes most people would not describe as social harms. Adults with existing jobs largely kept working.

What this suggests is that the "incentive to work" argument assumes people work primarily to avoid destitution, when in practice most people also work for structure, status, and purpose that a basic income does not eliminate. The fear is not baseless, but the data we actually have does not support it at the scale critics predict.

None of this proves UBI is costless or simple to implement. It does mean the strongest objection to it rests on an assumption about human motivation that our best available evidence does not confirm.`,
  },
  {
    id: 'E15-mid-common-word-name-will',
    band: 'mid',
    studentFullName: 'Will Hartigan',
    note: 'Student whose first name is an ordinary English word, used heavily in the essay as a common noun and auxiliary verb. Guards prose-mode redaction against mangling the essay - see common-word-names.server.ts.',
    essayText: `Philosophers have argued about free will for centuries, and I will not pretend to settle the question here. What I will do is argue that the debate matters less than we think, because how we treat each other should not depend on how it resolves.

If determinism is true, then every choice I make will have been fixed long before I made it, and the sense that I could have done otherwise will be an illusion. That is unsettling. But notice what does not change: a person who harms others will still be dangerous, a person who helps others will still be worth encouraging, and the practice of praising and blaming will still shape what people do next. Blame will function as a lever even if it does not function as cosmic justice.

If libertarian free will is true instead, then we are authors of our actions in the fullest sense, and responsibility means what we always thought it meant. But even here, most of us will admit that circumstance narrows the field of what a person can realistically choose. A child raised without stability will face a harder set of options than one raised with it, and pretending otherwise will not make us more just.

So my claim is this: whichever way the metaphysics falls, the practical conclusion will look similar. We should hold people accountable, because accountability changes behavior, and we should temper that accountability with humility about what we would have done in their position. Free will may be the wrong thing to argue about. What we will actually do with each other is the better question.`,
  },
];
