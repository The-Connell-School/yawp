import { Outlet } from 'react-router';

export default function MyClassesRoute() {
  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <Outlet />
    </section>
  );
}
