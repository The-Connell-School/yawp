// Verbatim rhetorical analysis passages for AP English Language Q2.
//
// WHY THIS FILE EXISTS. A rhetorical analysis question is only answerable if the
// student has the actual document in front of them. The real exam gives them a
// complete, self-contained passage -- roughly 500-750 words, preceded by a short
// headnote establishing the rhetorical situation. A single famous sentence is not
// a Q2 passage: there is nothing to analyze, no line of reasoning to trace, and
// no way to earn Row B 4, which requires explaining how MULTIPLE rhetorical
// choices work together.
//
// So these passages are held here as verbatim constants rather than inline in
// ap-english-lang-library-data.ts, where their length would bury the metadata.
// The library entry supplies the headnote (its `prompt`); this file supplies the
// document.
//
// PROVENANCE. Every text below is transcribed from the NLTK `inaugural` corpus
// (packages/corpora/inaugural.zip in the nltk_data distribution), which carries
// the U.S. presidential inaugural addresses. All three are U.S. federal
// government works published well before 1929 or authored by a federal officer
// in the course of duty, so all are public domain in the United States.
//
// Normalization applied to the corpus text, and nothing else:
//   - the corpus renders em dashes as "--"; restored to a real em dash
//   - collapsed runs of whitespace
//   - Lincoln 1865: restored the comma in "All dreaded it, all sought to avert
//     it." which the corpus drops
//   - Kennedy 1961: removed two stray scanner characters ("I have sworn I
//     before you", "our forebears l prescribed")
// No wording was changed, modernized, or abridged mid-sentence. Where a passage
// is an excerpt it is a contiguous run of whole paragraphs from the start of the
// address, never a stitched-together highlight reel.

/**
 * Lincoln's Second Inaugural Address, March 4, 1865 -- the COMPLETE address
 * (698 words). Short enough to assign whole, the way the exam assigns the
 * Gettysburg Address whole.
 */
export const LINCOLN_SECOND_INAUGURAL = [
  "Fellow-Countrymen:",
  "",
  "At this second appearing to take the oath of the Presidential office there is less occasion for an extended address than there was at the first. Then a statement somewhat in detail of a course to be pursued seemed fitting and proper. Now, at the expiration of four years, during which public declarations have been constantly called forth on every point and phase of the great contest which still absorbs the attention and engrosses the energies of the nation, little that is new could be presented. The progress of our arms, upon which all else chiefly depends, is as well known to the public as to myself, and it is, I trust, reasonably satisfactory and encouraging to all. With high hope for the future, no prediction in regard to it is ventured.",
  "",
  "On the occasion corresponding to this four years ago all thoughts were anxiously directed to an impending civil war. All dreaded it, all sought to avert it. While the inaugural address was being delivered from this place, devoted altogether to saving the Union without war, urgent agents were in the city seeking to destroy it without war—seeking to dissolve the Union and divide effects by negotiation. Both parties deprecated war, but one of them would make war rather than let the nation survive, and the other would accept war rather than let it perish, and the war came.",
  "",
  "One-eighth of the whole population were colored slaves, not distributed generally over the Union, but localized in the southern part of it. These slaves constituted a peculiar and powerful interest. All knew that this interest was somehow the cause of the war. To strengthen, perpetuate, and extend this interest was the object for which the insurgents would rend the Union even by war, while the Government claimed no right to do more than to restrict the territorial enlargement of it. Neither party expected for the war the magnitude or the duration which it has already attained. Neither anticipated that the cause of the conflict might cease with or even before the conflict itself should cease. Each looked for an easier triumph, and a result less fundamental and astounding. Both read the same Bible and pray to the same God, and each invokes His aid against the other. It may seem strange that any men should dare to ask a just God's assistance in wringing their bread from the sweat of other men's faces, but let us judge not, that we be not judged. The prayers of both could not be answered. That of neither has been answered fully. The Almighty has His own purposes. \"Woe unto the world because of offenses; for it must needs be that offenses come, but woe to that man by whom the offense cometh.\" If we shall suppose that American slavery is one of those offenses which, in the providence of God, must needs come, but which, having continued through His appointed time, He now wills to remove, and that He gives to both North and South this terrible war as the woe due to those by whom the offense came, shall we discern therein any departure from those divine attributes which the believers in a living God always ascribe to Him? Fondly do we hope, fervently do we pray, that this mighty scourge of war may speedily pass away. Yet, if God wills that it continue until all the wealth piled by the bondsman's two hundred and fifty years of unrequited toil shall be sunk, and until every drop of blood drawn with the lash shall be paid by another drawn with the sword, as was said three thousand years ago, so still it must be said \"the judgments of the Lord are true and righteous altogether.\"",
  "",
  "With malice toward none, with charity for all, with firmness in the right as God gives us to see the right, let us strive on to finish the work we are in, to bind up the nation's wounds, to care for him who shall have borne the battle and for his widow and his orphan, to do all which may achieve and cherish a just and lasting peace among ourselves and with all nations.",
].join('\n');

/**
 * Kennedy's Inaugural Address, January 20, 1961 -- the opening through the
 * appeal to adversaries (670 words of a 1,390-word address). Ends on a complete
 * movement of the argument, and carries the "torch has been passed" metaphor,
 * the "pay any price, bear any burden" asyndeton, and the five-part "To
 * those..." anaphora, so there are several choices to explain rather than one.
 */
export const KENNEDY_INAUGURAL_OPENING = [
  "Vice President Johnson, Mr. Speaker, Mr. Chief Justice, President Eisenhower, Vice President Nixon, President Truman, reverend clergy, fellow citizens, we observe today not a victory of party, but a celebration of freedom—symbolizing an end, as well as a beginning—signifying renewal, as well as change. For I have sworn before you and Almighty God the same solemn oath our forebears prescribed nearly a century and three quarters ago.",
  "",
  "The world is very different now. For man holds in his mortal hands the power to abolish all forms of human poverty and all forms of human life. And yet the same revolutionary beliefs for which our forebears fought are still at issue around the globe—the belief that the rights of man come not from the generosity of the state, but from the hand of God.",
  "",
  "We dare not forget today that we are the heirs of that first revolution. Let the word go forth from this time and place, to friend and foe alike, that the torch has been passed to a new generation of Americans—born in this century, tempered by war, disciplined by a hard and bitter peace, proud of our ancient heritage—and unwilling to witness or permit the slow undoing of those human rights to which this Nation has always been committed, and to which we are committed today at home and around the world.",
  "",
  "Let every nation know, whether it wishes us well or ill, that we shall pay any price, bear any burden, meet any hardship, support any friend, oppose any foe, in order to assure the survival and the success of liberty.",
  "",
  "This much we pledge—and more.",
  "",
  "To those old allies whose cultural and spiritual origins we share, we pledge the loyalty of faithful friends. United, there is little we cannot do in a host of cooperative ventures. Divided, there is little we can do—for we dare not meet a powerful challenge at odds and split asunder.",
  "",
  "To those new States whom we welcome to the ranks of the free, we pledge our word that one form of colonial control shall not have passed away merely to be replaced by a far more iron tyranny. We shall not always expect to find them supporting our view. But we shall always hope to find them strongly supporting their own freedom—and to remember that, in the past, those who foolishly sought power by riding the back of the tiger ended up inside.",
  "",
  "To those peoples in the huts and villages across the globe struggling to break the bonds of mass misery, we pledge our best efforts to help them help themselves, for whatever period is required—not because the Communists may be doing it, not because we seek their votes, but because it is right. If a free society cannot help the many who are poor, it cannot save the few who are rich.",
  "",
  "To our sister republics south of our border, we offer a special pledge—to convert our good words into good deeds—in a new alliance for progress—to assist free men and free governments in casting off the chains of poverty. But this peaceful revolution of hope cannot become the prey of hostile powers. Let all our neighbors know that we shall join with them to oppose aggression or subversion anywhere in the Americas. And let every other power know that this Hemisphere intends to remain the master of its own house.",
  "",
  "To that world assembly of sovereign states, the United Nations, our last best hope in an age where the instruments of war have far outpaced the instruments of peace, we renew our pledge of support—to prevent it from becoming merely a forum for invective—to strengthen its shield of the new and the weak—and to enlarge the area in which its writ may run.",
  "",
  "Finally, to those nations who would make themselves our adversary, we offer not a pledge but a request: that both sides begin anew the quest for peace, before the dark powers of destruction unleashed by science engulf all humanity in planned or accidental self-destruction.",
].join('\n');

/**
 * Franklin D. Roosevelt's First Inaugural Address, March 4, 1933 -- the opening
 * through the case that recovery is a question of values (700 words of a
 * 1,885-word address). Carries "the only thing we have to fear is fear itself"
 * and the "money changers ... temple" allusion.
 */
export const ROOSEVELT_FIRST_INAUGURAL_OPENING = [
  "I am certain that my fellow Americans expect that on my induction into the Presidency I will address them with a candor and a decision which the present situation of our Nation impels. This is preeminently the time to speak the truth, the whole truth, frankly and boldly. Nor need we shrink from honestly facing conditions in our country today. This great Nation will endure as it has endured, will revive and will prosper. So, first of all, let me assert my firm belief that the only thing we have to fear is fear itself—nameless, unreasoning, unjustified terror which paralyzes needed efforts to convert retreat into advance. In every dark hour of our national life a leadership of frankness and vigor has met with that understanding and support of the people themselves which is essential to victory. I am convinced that you will again give that support to leadership in these critical days.",
  "",
  "In such a spirit on my part and on yours we face our common difficulties. They concern, thank God, only material things. Values have shrunken to fantastic levels; taxes have risen; our ability to pay has fallen; government of all kinds is faced by serious curtailment of income; the means of exchange are frozen in the currents of trade; the withered leaves of industrial enterprise lie on every side; farmers find no markets for their produce; the savings of many years in thousands of families are gone.",
  "",
  "More important, a host of unemployed citizens face the grim problem of existence, and an equally great number toil with little return. Only a foolish optimist can deny the dark realities of the moment.",
  "",
  "Yet our distress comes from no failure of substance. We are stricken by no plague of locusts. Compared with the perils which our forefathers conquered because they believed and were not afraid, we have still much to be thankful for. Nature still offers her bounty and human efforts have multiplied it. Plenty is at our doorstep, but a generous use of it languishes in the very sight of the supply. Primarily this is because the rulers of the exchange of mankind's goods have failed, through their own stubbornness and their own incompetence, have admitted their failure, and abdicated. Practices of the unscrupulous money changers stand indicted in the court of public opinion, rejected by the hearts and minds of men.",
  "",
  "True they have tried, but their efforts have been cast in the pattern of an outworn tradition. Faced by failure of credit they have proposed only the lending of more money. Stripped of the lure of profit by which to induce our people to follow their false leadership, they have resorted to exhortations, pleading tearfully for restored confidence. They know only the rules of a generation of self-seekers. They have no vision, and when there is no vision the people perish.",
  "",
  "The money changers have fled from their high seats in the temple of our civilization. We may now restore that temple to the ancient truths. The measure of the restoration lies in the extent to which we apply social values more noble than mere monetary profit.",
  "",
  "Happiness lies not in the mere possession of money; it lies in the joy of achievement, in the thrill of creative effort. The joy and moral stimulation of work no longer must be forgotten in the mad chase of evanescent profits. These dark days will be worth all they cost us if they teach us that our true destiny is not to be ministered unto but to minister to ourselves and to our fellow men.",
  "",
  "Recognition of the falsity of material wealth as the standard of success goes hand in hand with the abandonment of the false belief that public office and high political position are to be valued only by the standards of pride of place and personal profit; and there must be an end to a conduct in banking and in business which too often has given to a sacred trust the likeness of callous and selfish wrongdoing. Small wonder that confidence languishes, for it thrives only on honesty, on honor, on the sacredness of obligations, on faithful protection, on unselfish performance; without them it cannot live.",
].join('\n');
