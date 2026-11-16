// Component fixture only. No application server, auth, or database.
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { PostToClass } from '../../../app/routes/app.lesson-planner_.$conversationId.packet/v3/share-cards';
import { STACK_THEME } from '../../../app/routes/app.lesson-planner_.$conversationId.packet/v3/theme';
import '../../../app/app.css';

createRoot(document.getElementById('root')!).render(
  <RouterProvider router={createMemoryRouter([{
    path: '/',
    element: <main style={{ ...STACK_THEME, maxWidth: 360, margin: '32px auto', padding: 16 }}>
      <PostToClass conversationId="fixture" title="Exit tickets" v2 />
    </main>,
  }])} />
);
