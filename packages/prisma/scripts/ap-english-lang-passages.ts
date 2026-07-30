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

// The two passages below are transcribed from Project Gutenberg editions
// mirrored by the GITenberg project (raw.githubusercontent.com/GITenberg/...),
// with the same normalization policy as above: em dashes restored from "--",
// hard-wrapped lines unwrapped, verse line breaks kept, nothing reworded.

/**
 * Booker T. Washington's Atlanta Exposition Address, September 18, 1895 -- the
 * COMPLETE address (1,587 words) as Washington reproduces it in "Up from
 * Slavery", chapter XIV (Project Gutenberg #2376). Published 1901; public
 * domain. Carries the full "Cast down your bucket where you are" extended
 * metaphor across both of its audiences.
 */
export const WASHINGTON_ATLANTA_EXPOSITION_ADDRESS = [
  "Mr. President and Gentlemen of the Board of Directors and Citizens.",
  "",
  "One-third of the population of the South is of the Negro race. No enterprise seeking the material, civil, or moral welfare of this section can disregard this element of our population and reach the highest success. I but convey to you, Mr. President and Directors, the sentiment of the masses of my race when I say that in no way have the value and manhood of the American Negro been more fittingly and generously recognized than by the managers of this magnificent Exposition at every stage of its progress. It is a recognition that will do more to cement the friendship of the two races than any occurrence since the dawn of our freedom.",
  "",
  "Not only this, but the opportunity here afforded will awaken among us a new era of industrial progress. Ignorant and inexperienced, it is not strange that in the first years of our new life we began at the top instead of at the bottom; that a seat in Congress or the state legislature was more sought than real estate or industrial skill; that the political convention or stump speaking had more attractions than starting a dairy farm or truck garden.",
  "",
  "A ship lost at sea for many days suddenly sighted a friendly vessel. From the mast of the unfortunate vessel was seen a signal, \"Water, water; we die of thirst!\" The answer from the friendly vessel at once came back, \"Cast down your bucket where you are.\" A second time the signal, \"Water, water; send us water!\" ran up from the distressed vessel, and was answered, \"Cast down your bucket where you are.\" And a third and fourth signal for water was answered, \"Cast down your bucket where you are.\" The captain of the distressed vessel, at last heading the injunction, cast down his bucket, and it came up full of fresh, sparkling water from the mouth of the Amazon River. To those of my race who depend on bettering their condition in a foreign land or who underestimate the importance of cultivating friendly relations with the Southern white man, who is their next-door neighbour, I would say: \"Cast down your bucket where you are\"—cast it down in making friends in every manly way of the people of all races by whom we are surrounded.",
  "",
  "Cast it down in agriculture, mechanics, in commerce, in domestic service, and in the professions. And in this connection it is well to bear in mind that whatever other sins the South may be called to bear, when it comes to business, pure and simple, it is in the South that the Negro is given a man's chance in the commercial world, and in nothing is this Exposition more eloquent than in emphasizing this chance. Our greatest danger is that in the great leap from slavery to freedom we may overlook the fact that the masses of us are to live by the productions of our hands, and fail to keep in mind that we shall prosper in proportion as we learn to dignify and glorify common labour and put brains and skill into the common occupations of life; shall prosper in proportion as we learn to draw the line between the superficial and the substantial, the ornamental gewgaws of life and the useful. No race can prosper till it learns that there is as much dignity in tilling a field as in writing a poem. It is at the bottom of life we must begin, and not at the top. Nor should we permit our grievances to overshadow our opportunities.",
  "",
  "To those of the white race who look to the incoming of those of foreign birth and strange tongue and habits of the prosperity of the South, were I permitted I would repeat what I say to my own race: \"Cast down your bucket where you are.\" Cast it down among the eight millions of Negroes whose habits you know, whose fidelity and love you have tested in days when to have proved treacherous meant the ruin of your firesides. Cast down your bucket among these people who have, without strikes and labour wars, tilled your fields, cleared your forests, builded your railroads and cities, and brought forth treasures from the bowels of the earth, and helped make possible this magnificent representation of the progress of the South. Casting down your bucket among my people, helping and encouraging them as you are doing on these grounds, and to education of head, hand, and heart, you will find that they will buy your surplus land, make blossom the waste places in your fields, and run your factories. While doing this, you can be sure in the future, as in the past, that you and your families will be surrounded by the most patient, faithful, law-abiding, and unresentful people that the world has seen. As we have proved our loyalty to you in the past, nursing your children, watching by the sick-bed of your mothers and fathers, and often following them with tear-dimmed eyes to their graves, so in the future, in our humble way, we shall stand by you with a devotion that no foreigner can approach, ready to lay down our lives, if need be, in defence of yours, interlacing our industrial, commercial, civil, and religious life with yours in a way that shall make the interests of both races one. In all things that are purely social we can be as separate as the fingers, yet one as the hand in all things essential to mutual progress.",
  "",
  "There is no defence or security for any of us except in the highest intelligence and development of all. If anywhere there are efforts tending to curtail the fullest growth of the Negro, let these efforts be turned into stimulating, encouraging, and making him the most useful and intelligent citizen. Effort or means so invested will pay a thousand per cent interest. These efforts will be twice blessed—\"blessing him that gives and him that takes.\"",
  "",
  "There is no escape through law of man or God from the inevitable:—",
  "",
  "The laws of changeless justice bind\nOppressor with oppressed;\nAnd close as sin and suffering joined\nWe march to fate abreast.",
  "",
  "Nearly sixteen millions of hands will aid you in pulling the load upward, or they will pull against you the load downward. We shall constitute one-third and more of the ignorance and crime of the South, or one-third its intelligence and progress; we shall contribute one-third to the business and industrial prosperity of the South, or we shall prove a veritable body of death, stagnating, depressing, retarding every effort to advance the body politic.",
  "",
  "Gentlemen of the Exposition, as we present to you our humble effort at an exhibition of our progress, you must not expect overmuch. Starting thirty years ago with ownership here and there in a few quilts and pumpkins and chickens (gathered from miscellaneous sources), remember the path that has led from these to the inventions and production of agricultural implements, buggies, steam-engines, newspapers, books, statuary, carving, paintings, the management of drug-stores and banks, has not been trodden without contact with thorns and thistles. While we take pride in what we exhibit as a result of our independent efforts, we do not for a moment forget that our part in this exhibition would fall far short of your expectations but for the constant help that has come to our education life, not only from the Southern states, but especially from Northern philanthropists, who have made their gifts a constant stream of blessing and encouragement.",
  "",
  "The wisest among my race understand that the agitation of questions of social equality is the extremest folly, and that progress in the enjoyment of all the privileges that will come to us must be the result of severe and constant struggle rather than of artificial forcing. No race that has anything to contribute to the markets of the world is long in any degree ostracized. It is important and right that all privileges of the law be ours, but it is vastly more important that we be prepared for the exercises of these privileges. The opportunity to earn a dollar in a factory just now is worth infinitely more than the opportunity to spend a dollar in an opera-house.",
  "",
  "In conclusion, may I repeat that nothing in thirty years has given us more hope and encouragement, and drawn us so near to you of the white race, as this opportunity offered by the Exposition; and here bending, as it were, over the altar that represents the results of the struggles of your race and mine, both starting practically empty-handed three decades ago, I pledge that in your effort to work out the great and intricate problem which God has laid at the doors of the South, you shall have at all times the patient, sympathetic help of my race; only let this be constantly in mind, that, while from representations in these buildings of the product of field, of forest, of mine, of factory, letters, and art, much good will come, yet far above and beyond material benefits will be that higher good, that, let us pray God, will come, in a blotting out of sectional differences and racial animosities and suspicions, in a determination to administer absolute justice, in a willing obedience among all classes to the mandates of law. This, this, coupled with our material prosperity, will bring into our beloved South a new heaven and a new earth.",
].join('\n');

/**
 * The Declaration of Sentiments, Seneca Falls Convention, July 1848 -- the
 * COMPLETE declaration (969 words) as printed in "History of Woman Suffrage,
 * Volume I" (Project Gutenberg #28020), including the full list of grievances.
 * The convention's resolutions are a separate document and are not included.
 */
export const STANTON_DECLARATION_OF_SENTIMENTS = [
  "When, in the course of human events, it becomes necessary for one portion of the family of man to assume among the people of the earth a position different from that which they have hitherto occupied, but one to which the laws of nature and of nature's God entitle them, a decent respect to the opinions of mankind requires that they should declare the causes that impel them to such a course.",
  "",
  "We hold these truths to be self-evident: that all men and women are created equal; that they are endowed by their Creator with certain inalienable rights; that among these are life, liberty, and the pursuit of happiness; that to secure these rights governments are instituted, deriving their just powers from the consent of the governed. Whenever any form of government becomes destructive of these ends, it is the right of those who suffer from it to refuse allegiance to it, and to insist upon the institution of a new government, laying its foundation on such principles, and organizing its powers in such form, as to them shall seem most likely to effect their safety and happiness. Prudence, indeed, will dictate that governments long established should not be changed for light and transient causes; and accordingly all experience hath shown that mankind are more disposed to suffer, while evils are sufferable, than to right themselves by abolishing the forms to which they were accustomed. But when a long train of abuses and usurpations, pursuing invariably the same object evinces a design to reduce them under absolute despotism, it is their duty to throw off such government, and to provide new guards for their future security. Such has been the patient sufferance of the women under this government, and such is now the necessity which constrains them to demand the equal station to which they are entitled.",
  "",
  "The history of mankind is a history of repeated injuries and usurpations on the part of man toward woman, having in direct object the establishment of an absolute tyranny over her. To prove this, let facts be submitted to a candid world.",
  "",
  "He has never permitted her to exercise her inalienable right to the elective franchise.",
  "",
  "He has compelled her to submit to laws, in the formation of which she had no voice.",
  "",
  "He has withheld from her rights which are given to the most ignorant and degraded men—both natives and foreigners.",
  "",
  "Having deprived her of this first right of a citizen, the elective franchise, thereby leaving her without representation in the halls of legislation, he has oppressed her on all sides.",
  "",
  "He has made her, if married, in the eye of the law, civilly dead.",
  "",
  "He has taken from her all right in property, even to the wages she earns.",
  "",
  "He has made her, morally, an irresponsible being, as she can commit many crimes with impunity, provided they be done in the presence of her husband. In the covenant of marriage, she is compelled to promise obedience to her husband, he becoming, to all intents and purposes, her master—the law giving him power to deprive her of her liberty, and to administer chastisement.",
  "",
  "He has so framed the laws of divorce, as to what shall be the proper causes, and in case of separation, to whom the guardianship of the children shall be given, as to be wholly regardless of the happiness of women—the law, in all cases, going upon a false supposition of the supremacy of man, and giving all power into his hands.",
  "",
  "After depriving her of all rights as a married woman, if single, and the owner of property, he has taxed her to support a government which recognizes her only when her property can be made profitable to it.",
  "",
  "He has monopolized nearly all the profitable employments, and from those she is permitted to follow, she receives but a scanty remuneration. He closes against her all the avenues to wealth and distinction which he considers most honorable to himself. As a teacher of theology, medicine, or law, she is not known.",
  "",
  "He has denied her the facilities for obtaining a thorough education, all colleges being closed against her.",
  "",
  "He allows her in Church, as well as State, but a subordinate position, claiming Apostolic authority for her exclusion from the ministry, and, with some exceptions, from any public participation in the affairs of the Church.",
  "",
  "He has created a false public sentiment by giving to the world a different code of morals for men and women, by which moral delinquencies which exclude women from society, are not only tolerated, but deemed of little account in man.",
  "",
  "He has usurped the prerogative of Jehovah himself, claiming it as his right to assign for her a sphere of action, when that belongs to her conscience and to her God.",
  "",
  "He has endeavored, in every way that he could, to destroy her confidence in her own powers, to lessen her self-respect, and to make her willing to lead a dependent and abject life.",
  "",
  "Now, in view of this entire disfranchisement of one-half the people of this country, their social and religious degradation—in view of the unjust laws above mentioned, and because women do feel themselves aggrieved, oppressed, and fraudulently deprived of their most sacred rights, we insist that they have immediate admission to all the rights and privileges which belong to them as citizens of the United States.",
  "",
  "In entering upon the great work before us, we anticipate no small amount of misconception, misrepresentation, and ridicule; but we shall use every instrumentality within our power to effect our object. We shall employ agents, circulate tracts, petition the State and National legislatures, and endeavor to enlist the pulpit and the press in our behalf. We hope this Convention will be followed by a series of Conventions embracing every part of the country.",
].join('\n');
