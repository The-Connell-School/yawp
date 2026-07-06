import type { DbqPrompt } from './types';

// Sample APUSH Reconstruction DBQ. Source bodies are realistic length so the
// scroll behavior of the active-source viewer is demonstrable.
export const sampleDbq: DbqPrompt = {
  id: 'sample-reconstruction-1',
  title: 'APUSH · Reconstruction (Library prompt)',
  essayType: 'dbq',
  period: 'ap-ush',
  era: ['period-5', 'period-6'],
  reasoningSkill: 'continuity-and-change',
  dateWindow: { from: 1865, to: 1900 },
  prompt:
    'Evaluate the extent to which the goals of Reconstruction (1865–1877) were achieved by 1900.',
  sources: [
    {
      id: 'src-a',
      label: 'A',
      title: 'Thirteenth Amendment to the U.S. Constitution',
      attribution: 'Ratified December 6, 1865.',
      body: `Section 1. Neither slavery nor involuntary servitude, except as a punishment for crime whereof the party shall have been duly convicted, shall exist within the United States, or any place subject to their jurisdiction.

Section 2. Congress shall have power to enforce this article by appropriate legislation.`,
    },
    {
      id: 'src-b',
      label: 'B',
      title: 'Petition of Black Residents of Edisto Island',
      attribution:
        'Letter to Major General O. O. Howard, Commissioner of the Freedmen’s Bureau, October 1865.',
      body: `We the freedmen of Edisto Island, South Carolina, have learned from the Major General Commanding that you have ordered all lands in the State of South Carolina to be restored to their former owners. We are well aware of the many perplexing and trying questions that burden your mind, and do therefore pray to God (the preserver of all, and who has through our late and beloved President Lincoln’s proclamation and the war made us a free people) that He may guide you in making your decisions.

General, we want Homesteads; we were promised Homesteads by the government. If it does not carry out the promises its agents made to us — if the government, having concluded to befriend its late enemies and to neglect to observe the principles of common faith between itself and us its allies in the war you said was over — now takes away from them all right to the soil they stand upon, save such as they can get by again working for your late and their all-time enemies, then, General, you will see this is not the condition of really free men.

You ask us to forgive the land owners of our island. You only lost your right arm in war and might forgive them; the man who tied me to a tree and gave me thirty-nine lashes and who stripped and flogged my mother and my sister, and who will not let me stay in his house to look for my dying mother, to him I cannot feel I can have mercy in my heart. We can only forgive as does the Christian, but it is impossible for us to give up our hard-earned land.`,
    },
    {
      id: 'src-c',
      label: 'C',
      title: 'Fourteenth Amendment to the U.S. Constitution, Section 1',
      attribution: 'Ratified July 9, 1868.',
      body: `All persons born or naturalized in the United States, and subject to the jurisdiction thereof, are citizens of the United States and of the State wherein they reside.

No State shall make or enforce any law which shall abridge the privileges or immunities of citizens of the United States; nor shall any State deprive any person of life, liberty, or property, without due process of law; nor deny to any person within its jurisdiction the equal protection of the laws.`,
    },
    {
      id: 'src-d',
      label: 'D',
      title: 'Thomas Nast political cartoon, “This Is a White Man’s Government”',
      attribution: 'Published in Harper’s Weekly, September 5, 1868.',
      body: `Three figures — a former Confederate soldier (still wearing his belt buckle), an Irish immigrant brandishing a club marked “A Vote,” and a wealthy New York Democrat clutching a wallet labeled “Capital for Votes” — join hands while standing on a prostrate Black Union veteran. The Black soldier, still wearing his uniform, reaches toward a fallen American flag and a ballot box that lies on its side.

The banner above the three reads: “We regard the Reconstruction Acts so-called of Congress as usurpations, and unconstitutional, revolutionary, and void.” In the background a Black orphanage burns; a lynched figure hangs from a lamppost in the smoke.`,
      caption:
        'Cartoon attacks the Democratic platform of 1868 as a coalition hostile to Black political rights.',
    },
    {
      id: 'src-e',
      label: 'E',
      title: 'Testimony of Henry Adams before the United States Senate',
      attribution:
        'Black laborer, former Union soldier, and Louisiana organizer of the 1879 Exodus, U.S. Senate testimony, 1880.',
      body: `In 1865, after we were freed, I and many other freedmen of our parish organized a committee to look into affairs and see the true condition of our race, to see whether it was possible we could stay under a people who had held us under bondage or not. We were a hundred and fifty members at the start, and we worked some of us as long as five years to know whether or not there was any safety for us down South amongst the people who had held us as slaves.

After we had looked into it carefully, we found that there was no way for us in the Southern States to live in peace among them. They would steal our crops, beat us, and pay no attention to the law. The land was held by the same men who had held it before; the same overseers were on the plantations; the same patrols were riding the roads at night, and they would whip us if they caught us off our places after dark, just the same as in slavery times.

We concluded that the whole thing, the whole South — every State in the South — had got into the hands of the very men that held us slaves; and consequently we felt that we had almost as well lie down and let them have us, or pack up and quit the country. So we agreed to leave, and that is what brought on what they call the Exodus to Kansas in 1879.`,
    },
    {
      id: 'src-f',
      label: 'F',
      title: 'Civil Rights Cases, Justice Joseph Bradley, majority opinion',
      attribution: 'Supreme Court of the United States, 1883.',
      body: `The Fourteenth Amendment is prohibitory upon the States only, and the legislation authorized to be adopted by Congress for enforcing it is not direct legislation on the matters respecting which the States are prohibited from making or enforcing certain laws, but it is corrective legislation. It does not invest Congress with power to legislate upon subjects which are within the domain of State legislation.

When a man has emerged from slavery, and by the aid of beneficent legislation has shaken off the inseparable concomitants of that state, there must be some stage in the progress of his elevation when he takes the rank of a mere citizen, and ceases to be the special favorite of the laws, and when his rights as a citizen or a man are to be protected in the ordinary modes by which other men’s rights are protected.

The wrongful act of an individual, unsupported by any such authority, is simply a private wrong, or a crime of that individual; an invasion of the rights of the injured party, it is true, whether they affect his person, his property, or his reputation; but if not sanctioned in some way by the State, or not done under State authority, his rights remain in full force, and may presumably be vindicated by resort to the laws of the State for redress.`,
    },
    {
      id: 'src-g',
      label: 'G',
      title: 'Mississippi Constitutional Convention, Address of the Committee on Franchise',
      attribution: 'Jackson, Mississippi, 1890.',
      body: `It is the manifest intention of this Convention to secure to the State of Mississippi an electorate of the white race. The Constitution of 1868 was framed under the bayonets of the federal soldiery and adopted by an electorate composed in great part of those who had recently been slaves; that constitution stands today as the badge of a Reconstruction imposed upon the white people of the State.

The literacy test, the poll tax, and the understanding clause are devices by which this end may lawfully be obtained without violating the letter of the Fifteenth Amendment. We are not here to provide means by which any considerable number of the colored race shall participate in the government of this State.

Of the methods proposed for the suppression of the Negro vote, the establishment of an educational and property qualification for the suffrage is the most defensible and the most likely to receive the sanction of the courts. The Convention is therefore advised to adopt provisions of that character, in the confident expectation that they will accomplish the object in view without inviting federal intervention.`,
    },
  ],
};
