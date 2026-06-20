import type { FC } from "hono/jsx";

export const Header: FC = () => (
  <header class="navbar bg-primary text-primary-content">
    <a href="/" class="btn btn-ghost text-xl font-bold">
      Ouroboros
    </a>
  </header>
);
