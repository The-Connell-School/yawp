// Component fixture only. No application server, auth, or database.
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { PostToClass } from '../../../app/routes/app.lesson-planner_.$conversationId.packet/v3/share-cards';
import { STACK_THEME } from '../../../app/routes/app.lesson-planner_.$conversationId.packet/v3/theme';
import { LandingDescription, LandingSections } from '../../../app/routes/app.assignment-types.$id/landing-copy/assignment-type-landing';
import { LANDING_PAGES, type LandingPageKey } from '../../../app/routes/app.assignment-types.$id/landing-copy/content';
import { LoungeTagList } from '../../../app/components/lounge/lounge-tags';
import { LOUNGE_FORM_TOPICS } from '../../../app/domain/lounge/tags';
import '../../../app/app.css';

const key = new URLSearchParams(location.search).get('landing') as LandingPageKey | null;
const landing = key && LANDING_PAGES[key];
const lounge = new URLSearchParams(location.search).has('lounge');

createRoot(document.getElementById('root')!).render(
  <RouterProvider router={createMemoryRouter([{
    path: '/',
    element: <main style={{ ...(landing ? {} : STACK_THEME), maxWidth: landing ? 1000 : 360, margin: '32px auto', padding: 16 }}>
      {lounge ? <>
        <fieldset aria-label="Module or topic">
          {LOUNGE_FORM_TOPICS.map((topic) => <label key={topic.key}>
            <input type="checkbox" name="topics" value={topic.key} />{topic.label}
          </label>)}
        </fieldset>
        <LoungeTagList tags={{ kinds: ['QUESTION'], subjects: ['history'], topics: ['ap-history', 'grading'] }} topicHref={(topic) => `/app/lounge?topic=${topic}`} />
      </> : landing ? <>
        <LandingDescription page={landing} />
        <LandingSections page={landing} modules={[]} lessonVideos={{ 2: '/tutorial/2' }} />
      </> : <PostToClass conversationId="fixture" title="Exit tickets" v2 />}
    </main>,
  }])} />
);
