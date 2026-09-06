import { PANEL_TITLE, describePanel } from '@web/panel-info';

export function App() {
  return (
    <main>
      <h1>{PANEL_TITLE}</h1>
      <p>{describePanel()}</p>
    </main>
  );
}
