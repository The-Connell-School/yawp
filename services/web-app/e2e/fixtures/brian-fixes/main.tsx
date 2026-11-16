// Component fixture only. No application server, auth, or database.
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { PostToClass } from '../../../app/routes/app.lesson-planner_.$conversationId.packet/v3/share-cards';
import { STACK_THEME } from '../../../app/routes/app.lesson-planner_.$conversationId.packet/v3/theme';
import { LandingDescription, LandingSections } from '../../../app/routes/app.assignment-types.$id/landing-copy/assignment-type-landing';
import { LANDING_PAGES, type LandingPageKey } from '../../../app/routes/app.assignment-types.$id/landing-copy/content';
import '../../../app/app.css';

const key = new URLSearchParams(location.search).get('landing') as LandingPageKey | null;
const landing = key && LANDING_PAGES[key];

createRoot(document.getElementById('root')!).render(
  <RouterProvider router={createMemoryRouter([{
    path: '/',
    element: <main style={{ ...(landing ? {} : STACK_THEME), maxWidth: landing ? 1000 : 360, margin: '32px auto', padding: 16 }}>
      {landing ? <>
        <LandingDescription page={landing} />
        <LandingSections page={landing} modules={[]} lessonVideos={{ 2: '/tutorial/2' }} />
      </> : <PostToClass conversationId="fixture" title="Exit tickets" v2 />}
    </main>,
  }])} />
);
