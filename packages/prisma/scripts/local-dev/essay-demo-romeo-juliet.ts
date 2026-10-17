/**
 * Romeo and Juliet: a full class set of thesis-driven essays for the essay
 * demo. Every paper is graded. The class is weakest in evidence and
 * organization; Maya is the evidence model and Daniel the evidence near miss,
 * Priya is the organization model and Hannah the organization near miss.
 */

import type { EssayDemoAssignment } from './essay-demo-data';

export const ROMEO_AND_JULIET_ESSAY: EssayDemoAssignment = {
  title: 'Romeo and Juliet: Who is to blame?',
  prompt:
    'Who bears the greatest responsibility for the deaths of Romeo and Juliet? Write a thesis-driven essay that takes a clear, arguable position and defends it with evidence from the play. Explain how each piece of evidence supports your claim, and address at least one other character a reader might blame.',
  assignedDaysAgo: 21,
  submissions: [
    // ─── maya: 5,4,5,5,4 — the evidence model ───────────────────────────────
    {
      studentKey: 'maya',
      title: "The Friar's Fatal Plan",
      submittedDaysAgo: 15,
      paragraphs: [
        "When Romeo and Juliet ends, the Prince gathers the survivors and announces that \"all are punished\" (5.3.295). It is tempting to spread the blame that evenly, across two feuding families and a pair of reckless teenagers. But the play asks us to look more closely at the one adult who knew everything and chose secrecy at every turn. Friar Laurence bears the greatest responsibility for the deaths of Romeo and Juliet, because he repeatedly substitutes risky schemes for honest action, and because he abandons Juliet at the exact moment his plan collapses.",
        "From his first scene with the lovers, the Friar understands that Romeo's love is unstable. When Romeo arrives announcing he has forgotten Rosaline, the Friar exclaims, \"Holy Saint Francis, what a change is here!\" (2.3.65) and warns that \"young men's love then lies / Not truly in their hearts, but in their eyes\" (2.3.67-68). He has diagnosed the problem perfectly: Romeo is moved by sight, not by steady feeling. Yet in the same scene he agrees to marry the couple, reasoning that \"this alliance may so happy prove / To turn your households' rancour to pure love\" (2.3.91-92). The word \"may\" gives him away. The Friar is gambling two lives on a political hope, using a secret wedding to solve a public feud that only public honesty could end. He even tells Romeo to go \"wisely and slow\" because \"they stumble that run fast\" (2.3.94), then performs the marriage that very afternoon.",
        "The Friar's second scheme is even more dangerous than the first. When Juliet threatens suicide rather than marry Paris, he offers her a potion that will make her appear dead for \"two and forty hours\" (4.1.105). A responsible adult in his position had other options: he could reveal the marriage to the Capulets, or appeal to the Prince, who has already spared Romeo's life once. Instead, the Friar builds a plan with a dozen moving parts, each of which must work perfectly. It depends on a sleeping drug, a funeral, a letter carried across a plague-stricken countryside, and Romeo's patience, which the Friar himself has watched fail again and again. When Friar John reports that he \"could not send it\" (5.2.14), the whole design falls apart, and the Friar's only response is \"Unhappy fortune!\" (5.2.17). Calling it fortune lets him avoid admitting that the plan was fragile from the start.",
        "The Friar's most damning choice comes in the tomb. He finds Juliet waking beside Romeo's body, hears a noise, and panics: \"Come, go, good Juliet. I dare no longer stay\" (5.3.159). In that line the Friar puts his own reputation ahead of a grieving thirteen-year-old whom he knows has already threatened to kill herself. He leaves her alone with a dagger and a dead husband. Moments later she calls the blade a \"happy dagger\" (5.3.169) and uses it. If the Friar had stayed for even a few more minutes, Juliet's death, at least, could have been prevented.",
        "Some readers place the blame on fate, pointing out that the Prologue calls the couple \"star-crossed lovers\" (Prologue 6). The Friar would agree; he tells Juliet that \"a greater power than we can contradict / Hath thwarted our intents\" (5.3.153-154). But that is exactly the excuse a guilty person would reach for. The stars did not choose secrecy over honesty, and they did not run from the tomb. Others blame the families' hatred, and that hatred certainly creates the pressure. Still, the feud was a condition the Friar knew about from the start, and every time he had a choice about how to handle it, he chose the hidden path.",
        "Shakespeare gives the Friar the play's wisest warnings and then has him ignore every one of them. That contrast is the point. The tragedy is not only that two young people loved too fast, but that the one adult who knew better moved just as fast and then walked away. The Friar's confession in the final scene is long and honest, but it comes too late; honesty, offered earlier, might have been the one thing that saved them.",
      ],
      grade: {
        scores: {
          thesis_and_content: 5,
          organization_and_structure: 4,
          evidence_and_support: 5,
          voice_and_style: 5,
          grammar_and_mechanics: 4,
        },
        comments: {
          thesis_and_content:
            'Your thesis is specific and genuinely arguable: not just "the Friar made mistakes," but that he chose secrecy over honesty at every turn. Every paragraph proves that exact claim.',
          organization_and_structure:
            'The paragraphs move in the order of the Friar\'s choices, which works well. Your body paragraphs could use sharper topic sentences that name the claim, not just the scene ("The Friar\'s most damning choice comes in the tomb" tells me where, not why).',
          evidence_and_support:
            'This is what evidence should look like. Your quotations are short, woven into your own sentences, and each one is followed by analysis, like your reading of the single word "may" in the Friar\'s reasoning.',
          voice_and_style:
            'Confident, precise, and a pleasure to read. Lines like "The stars did not choose secrecy over honesty, and they did not run from the tomb" land hard because they are so plain.',
          grammar_and_mechanics:
            'Very clean overall. Watch "whom he knows has already threatened": the pronoun is the subject of "has," so it should be "who."',
        },
        overallComment:
          'Maya, this is a model of how to use evidence: you quote only the words you need and then tell us exactly what they prove. Your counterargument turns the Friar\'s own excuse against him, which is a sophisticated move. Your next step is organization: give each body paragraph a topic sentence that states the claim, so a reader could follow your argument from those sentences alone.',
        inlineComments: [
          {
            excerpt: 'The word "may" gives him away.',
            content:
              'Excellent close reading. One word, and you make it carry the whole paragraph.',
          },
          {
            excerpt: 'Calling it fortune lets him avoid admitting that the plan was fragile',
            content: 'Sharp. You turn his own quotation into evidence against him.',
          },
          {
            excerpt: 'But that is exactly the excuse a guilty person would reach for.',
            content: 'Great counterargument move: you answer the objection instead of just naming it.',
          },
        ],
      },
    },

    // ─── priya: 4,5,4,4,5 — the organization model ──────────────────────────
    {
      studentKey: 'priya',
      title: 'A City at War with Itself',
      submittedDaysAgo: 16,
      paragraphs: [
        "Romeo and Juliet are often remembered as the most famous impulsive teenagers in literature, and it is easy to blame them for their own deaths. However, their choices only make sense inside the world they were born into. The ancient feud between the Montagues and the Capulets bears the greatest responsibility for the lovers' deaths. The feud forces their love into secrecy, it produces the street violence that gets Romeo banished, and it creates the household pressure that pushes Juliet toward the Friar's desperate plan. Each of these effects builds on the one before it, until the lovers have no safe options left.",
        "First, the feud makes it impossible for Romeo and Juliet to love each other openly. The moment Juliet learns who Romeo is, she cries, \"My only love sprung from my only hate!\" (1.5.138). Her love and her family's hatred arrive at the same instant, and she immediately understands that they cannot coexist. Later, on the balcony, she begs Romeo to \"Deny thy father and refuse thy name\" (2.2.34), because the name Montague is the only thing standing between them. Since they cannot ask their families' permission, the couple turns to a secret marriage. That secrecy matters, because it means no one who could protect them knows the truth.",
        "Second, the feud turns that secret marriage into a disaster by creating the violence of Act 3. Tybalt has been looking for a fight since the opening scene, when he announces, \"I hate the word, / As I hate hell, all Montagues, and thee\" (1.1.68-69). When he challenges Romeo, Romeo refuses because Tybalt is now his kinsman, but Mercutio cannot stand to see a Montague back down and fights in his place. As he dies, Mercutio curses \"a plague o' both your houses!\" (3.1.94), naming the true cause of his death: not Tybalt or Romeo alone, but the families' hatred. Romeo's revenge and his banishment follow directly from this fight. In other words, the feud does not just keep the lovers apart emotionally; it separates them physically.",
        "Finally, the feud creates the pressure inside the Capulet house that drives Juliet to fake her death. Lord Capulet rushes Juliet's marriage to Paris partly to lift the family's spirits after Tybalt's death, a death the feud caused. When she refuses, he explodes, telling her to \"hang, beg, starve, die in the streets\" (3.5.193). Juliet cannot explain why she refuses, since admitting her marriage to a Montague would be even worse. Trapped between a husband she cannot name and a father she cannot disobey, she turns to the Friar's potion. Every link in this chain connects back to the hatred between the two families.",
        "Some readers argue that Romeo himself is most to blame, since he rushes into marriage, kills Tybalt, and poisons himself without waiting for news. Romeo is certainly impulsive; even Juliet worries that their engagement is \"too rash, too unadvised, too sudden\" (2.2.118). Yet his rashness does the most damage only where the feud has already set the stage. Killing Tybalt would not have mattered if the streets were not already at war, and his suicide would never have happened if Juliet had not needed to fake her death in the first place. Romeo's impulses are the spark, but the feud is the fuel.",
        "In the final scene, the Prince tells the two fathers, \"See what a scourge is laid upon your hate\" (5.3.292), and the families finally make peace by promising to raise golden statues of their children. The ending is painful because it shows that the feud could have ended at any time; it simply took the deaths of two children for the adults to choose peace. Shakespeare's warning reaches beyond Verona. When a community holds on to an old hatred, it is the next generation that pays the price, often for a fight they never chose.",
      ],
      grade: {
        scores: {
          thesis_and_content: 4,
          organization_and_structure: 5,
          evidence_and_support: 4,
          voice_and_style: 4,
          grammar_and_mechanics: 5,
        },
        comments: {
          thesis_and_content:
            'Clear and defensible, with a three-part roadmap. "The feud" is a fairly common answer, though; push yourself to say something about it that a reader would not expect.',
          organization_and_structure:
            'This is the model for structure. Your roadmap promises three steps, your topic sentences deliver them in order ("First," "Second," "Finally"), and each step builds on the last instead of standing alone.',
          evidence_and_support:
            'Well-chosen quotations with good lead-ins. Some explanations stay close to summary (the Capulet paragraph especially); tell me what Capulet\'s exact words reveal.',
          voice_and_style:
            'Clear and controlled. "Romeo\'s impulses are the spark, but the feud is the fuel" is a memorable line; look for more chances like that.',
          grammar_and_mechanics:
            'Essentially flawless: correct quotation punctuation, clean citations, varied sentences.',
        },
        overallComment:
          'Priya, a reader could follow your entire argument just from your topic sentences, and that is exactly what strong organization does. Your counterargument paragraph takes Romeo seriously before answering him, and your conclusion moves beyond the play instead of repeating the intro. Next step: deepen the analysis after each quotation so your evidence is as strong as your structure.',
        inlineComments: [
          {
            excerpt: 'Each of these effects builds on the one before it',
            content: 'A roadmap that promises a chain, not a list. And then you deliver it.',
          },
          {
            excerpt: "Romeo's impulses are the spark, but the feud is the fuel.",
            content: 'Great way to concede a point and still win the argument.',
          },
          {
            excerpt: 'it is the next generation that pays the price',
            content: 'This conclusion extends your thinking rather than restating it. Nicely done.',
          },
        ],
      },
    },

    // ─── daniel: 5,4,2,4,4 — near miss on evidence ──────────────────────────
    {
      studentKey: 'daniel',
      title: "Romeo's Own Worst Enemy",
      submittedDaysAgo: 14,
      paragraphs: [
        "Everyone in Verona seems to have someone else to blame at the end of Romeo and Juliet. The Prince blames the families, the Friar blames fate, and the families blame each other. But if you look at who actually makes the decisions that lead to the tomb, one name keeps coming up. Romeo bears the greatest responsibility for the tragedy, because at every turning point he chooses the fastest, most emotional option instead of the wise one, and those choices drag Juliet down with him. The feud sets up the danger, but Romeo is the one who keeps walking into it.",
        "Romeo's pattern starts before he even meets Juliet. At the beginning of the play he is depressed about Rosaline and acts like his life is over. Then he goes to the Capulet party, sees Juliet, and forgets Rosaline completely in about five minutes. That same night he goes to her balcony and they talk about getting married. The next morning he goes to Friar Laurence and asks him to marry them right away. The Friar tells him he is moving too fast, but Romeo doesn't listen. This shows that Romeo falls in love based on feelings that change really quickly.",
        "The biggest example of Romeo's impulsiveness is in Act 3. Tybalt wants to fight Romeo, and at first Romeo tries to keep the peace because he is secretly married to Juliet. But then Mercutio fights Tybalt instead and gets killed when Romeo gets in the way. In Act 3 Romeo gets really mad and kills Tybalt. After that he realizes what he did and says something about being fortune's fool. Because of this the Prince banishes him from Verona. If Romeo had just stayed calm, he would never have been banished, and none of the rest of the Friar's plan would have been needed.",
        "Romeo also overreacts when he finds out he is banished. He goes to the Friar's cell, lies on the floor crying, and says that banishment is worse than death. He even tries to stab himself, and the Friar has to stop him. Then at the end of the play, when Balthasar tells him Juliet is dead, Romeo doesn't wait to find out more or talk to the Friar. He buys poison right away and rides to Verona. He kills Paris outside the tomb and then drinks the poison next to Juliet, just before she wakes up. If he had waited even a little bit, everything would have been fine.",
        "Some people would say that Friar Laurence is more to blame because the potion plan was his idea and it was risky. It is true that the plan had a lot of things that could go wrong. But the Friar only had to come up with a desperate plan because Romeo had already gotten himself banished. And the plan fails at the end mostly because Romeo acts before the Friar can reach him. The Friar made mistakes, but he was always reacting to messes that Romeo made first.",
        "It is easy to see Romeo as a romantic hero who died for love, and that is how a lot of people remember him. But the play actually shows him as someone whose emotions control him at every important moment, and Juliet is the one who pays the price for that. In the end, Romeo and Juliet is not just a story about a feud or about bad luck, it is a story about what happens when someone never stops to think.",
      ],
      grade: {
        scores: {
          thesis_and_content: 5,
          organization_and_structure: 4,
          evidence_and_support: 2,
          voice_and_style: 4,
          grammar_and_mechanics: 4,
        },
        comments: {
          thesis_and_content:
            'An original, arguable thesis. "The feud sets up the danger, but Romeo is the one who keeps walking into it" is the kind of claim a reader could really push back on, and your counterargument about the Friar is smart.',
          organization_and_structure:
            'Clear and logical: Romeo\'s pattern, the turning point, the ending, the counterargument. Your topic sentences name scenes more than claims, but the order works.',
          evidence_and_support:
            'This is the one thing holding the essay back. Your body paragraphs retell what happens ("Romeo gets really mad and kills Tybalt") instead of quoting Romeo\'s actual words and explaining what they show about him. You even mention "fortune\'s fool" without quoting or analyzing it.',
          voice_and_style:
            'Confident and direct, especially in your intro and conclusion. The body paragraphs slip into a more casual, plot-summary voice ("in about five minutes," "really mad").',
          grammar_and_mechanics:
            'Clean overall. Your final sentence has a comma splice ("about bad luck, it is a story"); a semicolon or period fixes it.',
        },
        overallComment:
          'Daniel, your thesis is one of the most original in the class, and you write with real confidence. The fix is clear: in each body paragraph, replace the plot summary with one short quotation of Romeo\'s own words, then spend two or three sentences explaining what it proves about his impulsiveness. Do that, and this becomes a top essay.',
        inlineComments: [
          {
            excerpt: 'In Act 3 Romeo gets really mad and kills Tybalt.',
            content:
              'What does Romeo actually say before he fights? His line about "fire-eyed fury" would prove your point far better than a summary.',
          },
          {
            excerpt: "says something about being fortune's fool",
            content: 'Quote it! "O, I am fortune\'s fool!" (3.1.136) is perfect evidence, and it is worth analyzing why he blames fortune here.',
          },
          {
            excerpt: 'If he had waited even a little bit, everything would have been fine.',
            content: 'Good instinct, but show us the moment in the text where he refuses to wait.',
          },
        ],
      },
    },

    // ─── hannah: 4,2,4,4,4 — near miss on organization ──────────────────────
    {
      studentKey: 'hannah',
      title: "The Father Who Wouldn't Listen",
      submittedDaysAgo: 17,
      paragraphs: [
        "Romeo and Juliet is one of the most famous love stories ever written, and it has been made into movies and plays many times. A lot of people think it is just about two teenagers falling in love too fast. When Capulet first talks to Paris, he actually seems like a caring father, saying \"My child is yet a stranger in the world\" (1.2.8) and asking Paris to wait until \"two more summers wither in their pride\" (1.2.10). The feud is also a big part of the story, and the Friar makes some questionable decisions too. But in my opinion Lord Capulet is the person most responsible for the deaths of Romeo and Juliet, because he turns from a protective father into a tyrant who leaves his daughter nowhere to go.",
        "Capulet's change is shocking. In Act 1 he tells Tybalt to leave Romeo alone at the party, calling Romeo \"a virtuous and well-governed youth\" (1.5.68), which shows he is not as obsessed with the feud as Tybalt is. The Friar also agrees to marry Romeo and Juliet in Act 2 because he hopes it will end the feud, which is a big risk. Then after Tybalt dies, Capulet suddenly decides Juliet will marry Paris without even asking her: \"O' Thursday let it be: o' Thursday, tell her, / She shall be married to this noble earl\" (3.4.20-21). The repetition of \"Thursday\" makes it sound like he is giving an order, not making a suggestion, and \"tell her\" means Juliet isn't even part of the conversation. This is the same man who said she was too young.",
        "When Juliet refuses, Capulet's language becomes violent. He calls her \"young baggage\" and a \"disobedient wretch\" (3.5.160) and threatens, \"hang, beg, starve, die in the streets, / For, by my soul, I'll ne'er acknowledge thee\" (3.5.193-194). These words treat Juliet like property he can throw away if it doesn't do what he wants. Even Lady Capulet says \"I would the fool were married to her grave!\" (3.5.140), which is dramatic irony because Juliet really does end up married to her grave. The Nurse also tells Juliet to marry Paris and calls Romeo a \"dishclout\" (3.5.220), so Juliet loses her last ally. Capulet doesn't listen to Juliet at all.",
        "Juliet only goes to the Friar and takes the potion because of her father. She tells the Friar she would rather \"leap, rather than marry Paris, / From off the battlements of any tower\" (4.1.77-78), which shows how desperate Capulet has made her. Also, Capulet moves the wedding up from Thursday to Wednesday, which ruins the Friar's timing, because now Juliet has to take the potion a day early and the letter to Romeo has even less time to arrive. Some people blame Romeo for being impulsive, and he is, but Romeo wasn't the one who forced Juliet into the potion. Capulet doesn't listen to Juliet, and that is the main problem. If he had just let her wait, like he told Paris in Act 1, she would never have needed the Friar's plan.",
        "In conclusion, Lord Capulet is the most responsible for the deaths of Romeo and Juliet. At the end of the play he offers Montague his hand and calls it \"my daughter's jointure\" (5.3.297), which is like a dowry, as if Juliet is still something to be traded. I think Shakespeare is also saying something about how women in this time period had no power over their own lives, because Juliet, Lady Capulet, and even the Nurse all have to do what the men decide. That might be the real tragedy of the play.",
      ],
      grade: {
        scores: {
          thesis_and_content: 4,
          organization_and_structure: 2,
          evidence_and_support: 4,
          voice_and_style: 4,
          grammar_and_mechanics: 4,
        },
        comments: {
          thesis_and_content:
            'A strong, arguable thesis: Capulet\'s change from protective father to tyrant is a real insight. Right now it is buried at the end of a long intro.',
          organization_and_structure:
            'This is the area to work on. Your thesis arrives last, after evidence and two other suspects; several paragraphs mix two or three claims (Paragraph 3 covers Capulet, Lady Capulet, and the Nurse); "Capulet doesn\'t listen to Juliet" repeats twice; and the conclusion opens a brand-new idea about women\'s power.',
          evidence_and_support:
            'Excellent quotations, and you analyze them well. Your reading of the repeated "Thursday" and "tell her" is exactly the kind of close reading I want.',
          voice_and_style:
            'Thoughtful and engaged. Cut the opening generalization about movies and start with Capulet.',
          grammar_and_mechanics:
            'Mostly clean, with accurate citations. A few long sentences would be clearer split in two.',
        },
        overallComment:
          'Hannah, your evidence is some of the best in the class: well chosen and closely read. The ideas are all here; they just need a better order. Next step: put your thesis first in the intro, give each body paragraph one claim with a topic sentence that states it, and save the idea about women\'s power for its own essay, or build it into your thesis.',
        inlineComments: [
          {
            excerpt: 'But in my opinion Lord Capulet is the person most responsible',
            content: 'Here is your thesis, and it is a good one. Move it up so the reader knows where you are headed from the start.',
          },
          {
            excerpt: 'The repetition of "Thursday" makes it sound like he is giving an order',
            content: 'Great close reading. This is exactly how to explain a quotation.',
          },
          {
            excerpt: 'how women in this time period had no power over their own lives',
            content: 'Interesting idea, but it is new in the conclusion. Either build it into your argument earlier or save it.',
          },
        ],
      },
    },

    // ─── jonah: 3,3,3,3,3 — competent and formulaic ─────────────────────────
    {
      studentKey: 'jonah',
      title: 'Who Is to Blame?',
      submittedDaysAgo: 15,
      paragraphs: [
        "In the play Romeo and Juliet by William Shakespeare, two young lovers from feuding families end up dying at the end. There are many characters who could be blamed for their deaths, such as Friar Laurence, the Nurse, and Romeo and Juliet themselves. Many people are to blame, but mostly the parents are responsible for the deaths of Romeo and Juliet. The parents are to blame because they started the feud, they did not pay attention to their children, and they forced Juliet to marry Paris.",
        "The first reason the parents are to blame is because of the feud. The feud between the Montagues and the Capulets is the reason Romeo and Juliet have to keep their love a secret. In the very first scene, Lord Capulet and Lord Montague both want to join the fight in the street. The Prince says, \"If ever you disturb our streets again, / Your lives shall pay the forfeit of the peace\" (1.1.94-95). This shows that the feud is serious and that the parents are part of it. If the parents did not have a feud, Romeo and Juliet could have just been together.",
        "The second reason the parents are to blame is that they did not pay attention to their children. Romeo's parents do not know why he is sad at the beginning of the play, and they have to ask Benvolio to find out. Lady Montague says, \"O, where is Romeo? Saw you him today?\" (1.1.114). Juliet's parents also do not know her very well, because the Nurse is the one who raised her. This shows that the parents were not close to their kids, so Romeo and Juliet did not feel like they could tell them the truth.",
        "The third reason the parents are to blame is that Lord Capulet forced Juliet to marry Paris. When Juliet says she will not marry him, Lord Capulet gets very angry. He tells her she can \"hang, beg, starve, die in the streets\" (3.5.193). This shows that he does not care about what Juliet wants. Because of this, Juliet goes to Friar Laurence and takes the potion, which leads to the deaths at the end.",
        "Some people might say that Friar Laurence is to blame because he gave Juliet the potion. However, he was only trying to help, and he would not have needed to if the parents had not forced her to marry Paris. In conclusion, the parents are the most to blame for the deaths of Romeo and Juliet because of the feud, not paying attention to their children, and forcing Juliet to marry Paris. At the end of the play the parents finally make peace, but it is too late.",
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
            'Your thesis takes a position, but "many people are to blame, but mostly the parents" hedges. Commit to one claim and say something specific about how the parents cause the deaths.',
          organization_and_structure:
            'Clear and easy to follow, with a roadmap and three body paragraphs. The "first reason / second reason / third reason" pattern is safe, though; try topic sentences that state each claim instead of numbering it.',
          evidence_and_support:
            'You include a relevant quotation in each body paragraph, which is great. Your explanations mostly say "this shows that..." and restate the quote; push further into what the specific words reveal.',
          voice_and_style:
            'Clear but flat. Repeating "the parents are to blame" in every topic sentence makes the essay feel mechanical.',
          grammar_and_mechanics:
            'Generally correct. Watch "the reason ... is because," which is redundant, and fold your counterargument into its own paragraph instead of the conclusion.',
        },
        overallComment:
          'Jonah, this is a solid, well-organized essay with evidence in every body paragraph. Your next step is analysis: after each quotation, write two more sentences about what the exact words show, instead of "this shows that." A more specific thesis will help too.',
        inlineComments: [
          {
            excerpt: 'Many people are to blame, but mostly the parents are responsible',
            content: 'Commit! Which parent, and how exactly do they cause the deaths?',
          },
          {
            excerpt: 'This shows that he does not care about what Juliet wants.',
            content: 'True, but which words in the quote show it? "Die in the streets" is worth unpacking.',
          },
          {
            excerpt: 'he was only trying to help',
            content: 'This counterargument needs more than one sentence. Why is the Friar less to blame?',
          },
        ],
      },
    },

    // ─── aaliyah: 4,3,3,4,3 — engaging voice, uneven development ────────────
    {
      studentKey: 'aaliyah',
      title: "Trust Issues: The Nurse's Betrayal",
      submittedDaysAgo: 14,
      paragraphs: [
        "Everybody needs one person they can trust completely. For Juliet, that person is supposed to be the Nurse. The Nurse raised her, knows all her secrets, and is the only one Juliet can really be herself around. Not her mom, who barely knows her, and definitely not her dad, who mostly yells at her. That is exactly why the Nurse is the most responsible for Juliet's death and Romeo's, when Juliet needed her most, the Nurse changed sides and left Juliet with no one but a desperate priest.",
        "At first the Nurse is Juliet's biggest supporter. She carries messages between Juliet and Romeo and helps set up the secret wedding. She even teases Juliet and makes her beg before finally giving her the good news. \"Then hie you hence to Friar Laurence' cell; / There stays a husband to make you a wife\" (2.5.68-69). The Nurse knows exactly what she is helping with, she isn't confused at all. She is basically the wedding planner for a marriage she knows the Capulets would never allow.",
        "Then everything falls apart. After Tybalt dies and Romeo is banished, Lord Capulet decides Juliet has to marry Paris. Juliet goes to the Nurse for advice, and the Nurse tells her to forget Romeo. \"I think it best you married with the County. / O, he's a lovely gentleman! / Romeo's a dishclout to him\" (3.5.218-220). This is so cold. The same woman who helped Juliet marry Romeo is now calling him a dishrag and telling her to marry a second husband, which is a sin. The Nurse is thinking about what is easy and safe for herself, not what is right for Juliet.",
        "Juliet's reaction shows how much this hurts her. Once the Nurse leaves she calls her \"Ancient damnation! O most wicked fiend!\" (3.5.235) and decides \"Thou and my bosom henceforth shall be twain\" (3.5.241). Honestly, I think this is the saddest moment in the play, even sadder than the tomb, because it is the moment Juliet stops being a kid. From this moment on Juliet is completely alone. She lies to her parents, she goes to the Friar by herself, and she takes the potion by herself. If the Nurse had stood by her, Juliet would have had someone to help her think things through, maybe she would not have taken such a huge risk.",
        "Some people blame Friar Laurence because the potion was his idea. That makes sense, but the Friar only came into it because Juliet had nobody else. The Nurse was supposed to be her person. In the end, Romeo and Juliet is a story about two kids who did not have adults they could count on, and the Nurse let Juliet down the worst of all.",
      ],
      grade: {
        scores: {
          thesis_and_content: 4,
          organization_and_structure: 3,
          evidence_and_support: 3,
          voice_and_style: 4,
          grammar_and_mechanics: 3,
        },
        comments: {
          thesis_and_content:
            'A fresh, arguable thesis. Blaming the Nurse for abandoning Juliet is an angle few readers would take, and you frame it around trust in a way that makes it matter.',
          organization_and_structure:
            'The before-and-after structure works, but development is uneven: your counterargument and conclusion are squeezed into one short paragraph.',
          evidence_and_support:
            'You picked the right moments. Two quotations are dropped in as their own sentences with no lead-in, and the Nurse\'s "dishclout" line deserves more than "This is so cold."',
          voice_and_style:
            'Your voice is a real strength. "She is basically the wedding planner" and "The Nurse was supposed to be her person" make your argument feel alive.',
          grammar_and_mechanics:
            'Watch for comma splices; there are three (in your thesis, Paragraph 2, and Paragraph 4). A period or semicolon fixes each one.',
        },
        overallComment:
          'Aaliyah, your voice and your thesis are both genuinely engaging; I wanted to keep reading. Your next step is evidence: introduce every quotation with your own words ("When Juliet asks for advice, the Nurse says...") and follow it with at least two sentences of analysis. Then give your counterargument its own full paragraph.',
        inlineComments: [
          {
            excerpt: "the Nurse is the most responsible for Juliet's death and Romeo's, when",
            content: 'Strong thesis, but this is a comma splice. Make it two sentences or use a semicolon.',
          },
          {
            excerpt: '"Then hie you hence to Friar Laurence\' cell;',
            content: 'Lead into this quote. Who is speaking, and to whom?',
          },
          {
            excerpt: 'This is so cold.',
            content: 'I agree, but explain why. What does "dishclout" tell us about how fast her loyalty changed?',
          },
        ],
      },
    },

    // ─── ethan: 2,2,2,3,2 — struggling, sincere ─────────────────────────────
    {
      studentKey: 'ethan',
      title: 'Fate and Everything',
      submittedDaysAgo: 14,
      paragraphs: [
        "Romeo and Juliet is a play by Shakespeare about two people who fall in love but there familys hate each other. In the end they both die which is very sad. I think the reason they die is because of fate and lots of things, like the Friar and the parents and Romeo also did some stuff wrong.",
        "First of all fate is a big reason. At the start of the play it says they are star crossed lovers which means the stars were against them from the beginning. So no matter what they did it was probably going to happen anyway. Also Romeo says he has a bad feeling before the party, he said something like his mind misgives some consequence in the stars. Which means he knew something bad was going to happen.",
        "The Friar also is to blame because he gave Juliet the potion. It was a really bad idea because if anything went wrong she would wake up in a tomb with dead people, and that is exactly what happened. Also the letter didnt get to Romeo because of the plague. That is not really the Friars fault but it is kind of fate again.",
        "The parents are to blame to. Capulet yelled at Juliet and said she had to marry Paris or he would kick her out. If my dad said that to me I would be really upset also so I understand why Juliet did what she did. The parents also had the feud that started everything and nobody even knows why they are fighting in the first place.",
        "Romeo also made mistakes like killing Tybalt and drinking the poison to fast. He should of waited. Mercutio said a plague on both your houses and thats kind of what happened, both houses lost there kids.",
        "In conclusion there are a lot of reasons Romeo and Juliet died. Mostly it was fate but the other people helped it happen. I think the lesson is that you should talk to your parents and not keep secrets, because if everybody talked to each other maybe nobody would of died.",
      ],
      grade: {
        scores: {
          thesis_and_content: 2,
          organization_and_structure: 2,
          evidence_and_support: 2,
          voice_and_style: 3,
          grammar_and_mechanics: 2,
        },
        comments: {
          thesis_and_content:
            '"Fate and lots of things" is not yet a thesis, because it blames everyone. Your conclusion says "mostly it was fate"; start with that and argue it.',
          organization_and_structure:
            'Each paragraph covers a different suspect, so the essay reads as a list. If your thesis is fate, every paragraph should prove fate.',
          evidence_and_support:
            'You remember important moments, like "star crossed" and Romeo\'s bad feeling before the party, but you paraphrase them instead of quoting and citing them.',
          voice_and_style:
            'I like how honest you are. Connecting Capulet\'s anger to how you would feel shows you really thought about Juliet as a person.',
          grammar_and_mechanics:
            'Several errors to fix: "there/their," "to/too," "should of/should have," missing apostrophes ("didnt," "Friars"), and run-on sentences.',
        },
        overallComment:
          'Ethan, you clearly understand the story and you care about what happens to these characters. Your one next step is to pick a single answer (I think fate, from your conclusion) and make every paragraph prove it with an exact quotation. Let\'s look up the Prologue line together.',
        inlineComments: [
          {
            excerpt: 'because of fate and lots of things',
            content: 'Pick one. Your conclusion says "mostly it was fate," so make that your thesis.',
          },
          {
            excerpt: 'he said something like his mind misgives some consequence in the stars',
            content: 'Great memory! Find the exact line in Act 1, Scene 4 and quote it.',
          },
          {
            excerpt: 'If my dad said that to me I would be really upset',
            content: 'I appreciate this honest connection. It shows real empathy for Juliet.',
          },
        ],
      },
    },

    // ─── sofia: 3,3,2,3,4 — clean, but evidence is summary ──────────────────
    {
      studentKey: 'sofia',
      title: 'Written in the Stars',
      submittedDaysAgo: 16,
      paragraphs: [
        "In William Shakespeare's Romeo and Juliet, two young people from enemy families fall in love, marry in secret, and die only a few days later. Many characters make mistakes along the way, including the Friar, the Nurse, and the parents. However, the greatest responsibility for the deaths of Romeo and Juliet belongs to fate, because the play shows from the very beginning that the lovers are doomed no matter what anyone does.",
        "The play tells the audience how the story will end before it even begins. In the Prologue, the Chorus explains that the lovers will die and that their deaths will end their families' fighting. Shakespeare describes them as star-crossed, which means that the stars, or fate, are against them. The Prologue also calls their love death-marked, which again shows that their deaths are certain. Because the ending is announced at the start, the audience watches the whole play knowing that nothing the characters do will change the outcome. This suggests that fate is in control of the story.",
        "Throughout the play, Romeo also seems to sense that something bad is going to happen. Before the Capulet party, he tells his friends that he has a bad feeling about the night and that something is hanging in the stars. Later, after he kills Tybalt, he calls himself fortune's fool. In both moments, Romeo feels that his life is being controlled by forces he does not understand. Romeo's fear before the party is especially important, because it comes before he has even met Juliet. It suggests that the tragedy is already in motion before any choices are made. These moments show that even the main character believes fate is guiding events.",
        "Fate also appears in the bad luck that ruins the Friar's plan. The Friar sends Friar John to deliver a letter to Romeo explaining that Juliet is only sleeping. However, Friar John is stuck in a house because of the plague and is never able to deliver it. As a result, Romeo hears only that Juliet is dead. He returns to Verona and kills himself just moments before Juliet wakes up. If the letter had arrived, or if Romeo had arrived a few minutes later, both lovers would have lived. This timing is too unlucky to be a coincidence.",
        "Some people might argue that Friar Laurence is to blame because the potion was his idea. It is true that his plan was risky. However, the plan only failed because of the plague and the timing, which no one could control. In conclusion, Romeo and Juliet shows that fate is the main cause of the lovers' deaths. Although the characters make mistakes, the stars decided their story from the very first lines of the play.",
      ],
      grade: {
        scores: {
          thesis_and_content: 3,
          organization_and_structure: 3,
          evidence_and_support: 2,
          voice_and_style: 3,
          grammar_and_mechanics: 4,
        },
        comments: {
          thesis_and_content:
            'A clear, defensible position. Fate is hard to argue against, though; consider what it means for the characters\' choices if fate is in control.',
          organization_and_structure:
            'Logical order (Prologue, Romeo\'s premonitions, the letter), with clear topic sentences. The counterargument and conclusion are crammed into one paragraph.',
          evidence_and_support:
            'Your evidence is mostly summary. You describe "star-crossed," "something hanging in the stars," and "fortune\'s fool" without ever quoting or citing them, so there are no exact words to analyze.',
          voice_and_style:
            'Clear and polished, but cautious. Phrases like "This suggests that fate is in control" could be bolder and more specific.',
          grammar_and_mechanics:
            'Very clean: correct apostrophes, varied sentences, and smooth transitions.',
        },
        overallComment:
          'Sofia, your writing is clean and your argument is easy to follow. The next step is evidence: you already know exactly which lines matter, so quote them directly with citations (the Prologue, 1.4, and 3.1) and explain what specific words like "star-crossed" reveal.',
        inlineComments: [
          {
            excerpt: 'Shakespeare describes them as star-crossed',
            content: 'Quote the full line and cite it (Prologue 6). Then analyze "star-crossed."',
          },
          {
            excerpt: "he calls himself fortune's fool",
            content: 'This is the right moment. Quote it and tell me what "fool" suggests about how Romeo sees himself.',
          },
          {
            excerpt: 'This timing is too unlucky to be a coincidence.',
            content: 'Interesting claim. Does the Friar say anything in 5.2 or 5.3 that supports it?',
          },
        ],
      },
    },

    // ─── marcus: 3,2,2,3,3 — reasonable idea, disorganized ──────────────────
    {
      studentKey: 'marcus',
      title: 'Tybalt Started It',
      submittedDaysAgo: 14,
      paragraphs: [
        "When people talk about who is to blame in Romeo and Juliet they usually say Romeo or the Friar. But I think people forget about Tybalt. Tybalt is the one who is always looking for a fight, and without him the whole second half of the play would not even happen. Tybalt is not the main character, but he is like the match that lights everything. So Tybalt is the most to blame for the deaths.",
        "Tybalt is angry from the very start. He really hates the Montagues more than anyone else in the play. In the first scene he jumps into the fight in the street even though Benvolio is trying to stop it. Then at the party he recognizes Romeo's voice and wants to kill him right there. Lord Capulet tells him to calm down. Romeo meets Juliet at the party too and they fall in love, and the Friar marries them the next day. The Friar thought it would end the feud. Tybalt is still mad about the party though and he sends Romeo a letter challenging him to a fight.",
        "Also the Nurse helped them get married, she was carrying messages. So she is a little to blame too. But back to Tybalt, in Act 3 he finds Romeo and calls him a villain. Romeo won't fight him because they are related now, but Tybalt doesn't know that. Mercutio fights Tybalt instead and Tybalt kills him under Romeo's arm. Then Romeo kills Tybalt and gets banished. This is the turning point of the whole play.",
        "After that everything goes wrong. Juliet's dad wants her to marry Paris because everyone is sad about Tybalt. That's another way it's Tybalt's fault, because if Tybalt didn't die there wouldn't be a rush for a wedding. Also Romeo only has to leave Verona because he killed Tybalt, so Romeo isn't there when Juliet needs him and that is why the Friar needs the letter plan. Juliet takes the potion and Romeo thinks she's dead and they both die. Mercutio even says \"a plague o' both your houses\" when he dies which shows he is mad at both families.",
        "Some people say Romeo is to blame for killing Tybalt but Tybalt started it. Romeo was trying to make peace at first and he only fought because Mercutio died. In conclusion Tybalt is to blame because he started the fight that got Romeo banished, and that led to everything else. If Tybalt had just let it go at the party none of this would have happened.",
      ],
      grade: {
        scores: {
          thesis_and_content: 3,
          organization_and_structure: 2,
          evidence_and_support: 2,
          voice_and_style: 3,
          grammar_and_mechanics: 3,
        },
        comments: {
          thesis_and_content:
            'Blaming Tybalt is a reasonable and interesting choice. Make the thesis say how Tybalt causes the deaths, not just that he does.',
          organization_and_structure:
            'The essay wanders. Paragraph 2 drifts into Romeo, Juliet, and the Friar, Paragraph 3 starts with the Nurse before "back to Tybalt," and the Mercutio quote shows up after you have already reached the ending.',
          evidence_and_support:
            'Only one quotation, and it is about both families rather than Tybalt. Tybalt\'s own lines ("I hate the word...") would prove your point much better.',
          voice_and_style:
            'Your voice is direct and confident ("Tybalt started it"). Some phrasing is too casual for an essay ("But back to Tybalt").',
          grammar_and_mechanics:
            'Mostly correct, with a comma splice in Paragraph 3 and some missing commas after introductory phrases.',
        },
        overallComment:
          'Marcus, you picked a suspect most people overlook, and you are right that Act 3 is the turning point. Your next step is organization: make a quick outline with one claim per paragraph about Tybalt, and cut anything that is not about him. Then find one Tybalt quotation for each paragraph.',
        inlineComments: [
          {
            excerpt: 'Also the Nurse helped them get married, she was carrying messages.',
            content: 'This is off topic for a Tybalt essay, and it is a comma splice. Cut it or save it for the counterargument.',
          },
          {
            excerpt: 'This is the turning point of the whole play.',
            content: 'Yes! This could be the topic sentence of its own paragraph.',
          },
          {
            excerpt: 'which shows he is mad at both families',
            content: 'This quote is about both families, not Tybalt. How does it help your argument?',
          },
        ],
      },
    },

    // ─── theo: 3,3,3,2,2 — okay argument, flat voice, mechanical errors ─────
    {
      studentKey: 'theo',
      title: 'The Friar Is to Blame',
      submittedDaysAgo: 15,
      paragraphs: [
        "In Romeo and Juliet a lot of bad things happen and alot of people make mistakes. But the person who is most to blame for Romeo and Juliet dying is Friar Laurence. The Friar is supposed to be a holy man who gives good advice but he does the opposite. This is because he married them in secret, he gave Juliet the potion and he left Juliet alone in the tomb. All of these things are very bad choices.",
        "First the Friar married Romeo and Juliet even though he knew it was a bad idea. He tells Romeo \"Wisely and slow. They stumble that run fast\" (2.3.94). This shows that the Friar knew Romeo was going to fast. But he still marries them the same day. Because he thinks it will end the feud. This shows that the Friar cared more about the feud then about if Romeo and Juliet were ready. It was very risky and its the first thing that went wrong.",
        "Second the Friar gave Juliet the potion. This was a very very dangerous plan. Juliet had to drink it and look dead and then wake up in the tomb. The Friar says \"Take thou this vial, being then in bed, / And this distilled liquor drink thou off\" (4.1.93-94). This shows that the Friar is the one who came up with the whole plan. If the letter didnt get to Romeo the plan would not work. Which is what happened. The plan had to many parts and it's chance of working was very low.",
        "Third the Friar left Juliet alone in the tomb. When he hears the watch coming he says \"Come, go, good Juliet. I dare no longer stay\" (5.3.159). This shows that he was very scared and he cared about himself more. Juliet was alone with Romeo dead and she killed herself with the dagger. If the Friar stayed she would still be alive. The Friar is supposed to be the one who helps people. Instead he ran away. This shows he was not a good friend to Juliet. This is very bad because he is a adult and a priest.",
        "Some people think Romeo is to blame because he was very impulsive. Which is true. Romeo did kill Tybalt and he did drink the poison to fast. But the Friar is an adult and he should of known better. In conclusion the Friar is the most to blame because he married them, he gave Juliet the potion and he left her in the tomb. This shows that adults need to make good choices to.",
      ],
      grade: {
        scores: {
          thesis_and_content: 3,
          organization_and_structure: 3,
          evidence_and_support: 3,
          voice_and_style: 2,
          grammar_and_mechanics: 2,
        },
        comments: {
          thesis_and_content:
            'A clear thesis with three reasons, and the reasons are good ones. "Very bad choices" is vague; say what makes them bad.',
          organization_and_structure:
            'Easy to follow with "First," "Second," and "Third." The counterargument is only two sentences and gets mixed into the conclusion.',
          evidence_and_support:
            'Good choices: each body paragraph has a relevant, cited quotation. The explanations are thin; "this shows that" is followed by a restatement rather than analysis.',
          voice_and_style:
            'Word choice is flat and repetitive. "This shows" appears six times and "very" eight; try verbs like "reveals" or "proves," and specific adjectives instead of "very."',
          grammar_and_mechanics:
            'Several patterns to fix: its/it\'s, to/too, then/than, "alot," "should of," "a adult," and sentence fragments like "Which is what happened."',
        },
        overallComment:
          'Theo, your argument against the Friar is solid and your quotations are well chosen. Your next step is style and proofreading: replace "this shows" and "very" with more precise words, and read your essay aloud to catch fragments and its/it\'s and to/too mix-ups.',
        inlineComments: [
          {
            excerpt: 'Because he thinks it will end the feud.',
            content: 'Fragment. Join this to the sentence before it.',
          },
          {
            excerpt: 'This was a very very dangerous plan.',
            content: 'Instead of "very very," find one precise word. Reckless? Fragile?',
          },
          {
            excerpt: "it's chance of working was very low",
            content: '"Its" (possessive) has no apostrophe. "It\'s" means "it is."',
          },
        ],
      },
    },
  ],
};
