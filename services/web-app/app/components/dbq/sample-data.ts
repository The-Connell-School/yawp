import type { DbqPrompt } from './types';

// Sample APUSH Reconstruction DBQ. Sources are abridged for prototype use;
// real prompt library entries ship full document bodies.
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
      body: 'Neither slavery nor involuntary servitude, except as a punishment for crime whereof the party shall have been duly convicted, shall exist within the United States, or any place subject to their jurisdiction.',
    },
    {
      id: 'src-b',
      label: 'B',
      title: 'Petition of Black Residents of Edisto Island',
      attribution:
        'Letter to Major General O. O. Howard, Commissioner of the Freedmen’s Bureau, October 1865.',
      body: 'General, we want Homesteads; we were promised Homesteads by the government. If it does not carry out the promises its agents made to us, if the government having concluded to befriend its late enemies and to neglect to observe the principles of common faith between its self and us its allies in the war you said was over, now takes away from them all right to the soil they stand upon save such as they can get by again working for your late and their all time enemies… You will see this is not the condition of really freemen.',
    },
    {
      id: 'src-c',
      label: 'C',
      title: 'Fourteenth Amendment to the U.S. Constitution, Section 1',
      attribution: 'Ratified July 9, 1868.',
      body: 'All persons born or naturalized in the United States, and subject to the jurisdiction thereof, are citizens of the United States and of the State wherein they reside… nor shall any State deprive any person of life, liberty, or property, without due process of law; nor deny to any person within its jurisdiction the equal protection of the laws.',
    },
    {
      id: 'src-d',
      label: 'D',
      title: 'Thomas Nast political cartoon, “This Is a White Man’s Government”',
      attribution: 'Published in Harper’s Weekly, September 5, 1868.',
      body: 'Three figures — a former Confederate soldier, an Irish immigrant, and a wealthy New York Democrat — join hands while standing on a prostrate Black Union veteran. Caption reads: “We regard the Reconstruction Acts so-called of Congress as usurpations, and unconstitutional, revolutionary, and void.”',
      caption:
        'Cartoon attacks the Democratic platform of 1868 as a coalition hostile to Black political rights.',
    },
    {
      id: 'src-e',
      label: 'E',
      title: 'Testimony of Henry Adams before the Senate',
      attribution:
        'Black laborer and former soldier from Louisiana, U.S. Senate testimony, 1880.',
      body: 'In 1865 … we organized a committee to look into affairs and see the true condition of our race, to see whether it was possible we could stay under a people who had held us under bondage or not. After we had looked into it, we found that there was no way … to live in peace among them. They would steal our crops, beat us, and pay no attention to the law.',
    },
    {
      id: 'src-f',
      label: 'F',
      title: 'Civil Rights Cases, Justice Joseph Bradley, majority opinion',
      attribution: 'Supreme Court of the United States, 1883.',
      body: 'When a man has emerged from slavery, and by the aid of beneficent legislation has shaken off the inseparable concomitants of that state, there must be some stage in the progress of his elevation when he takes the rank of a mere citizen, and ceases to be the special favorite of the laws… The wrongful act of an individual, unsupported by any such authority, is simply a private wrong, or a crime of that individual.',
    },
    {
      id: 'src-g',
      label: 'G',
      title: 'Mississippi Constitutional Convention, address of the Committee on Franchise',
      attribution: 'Jackson, Mississippi, 1890.',
      body: 'It is the manifest intention of this Convention to secure to the State of Mississippi white supremacy… The literacy test, the poll tax, and the understanding clause are devices by which this end may lawfully be obtained without violating the letter of the Fifteenth Amendment.',
    },
  ],
};
