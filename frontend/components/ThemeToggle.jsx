import { useEffect, useState } from "react";

export default function ThemeToggle({ mobileIconOnly = false }) {
  const [dark, setDark] = useState(() => localStorage.getItem("pair:theme") === "dark");

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("pair:theme", dark ? "dark" : "light");
  }, [dark]);

  return <button className={`theme-toggle ${mobileIconOnly ? "mobile-icon-only" : ""}`} type="button" onClick={() => setDark((value) => !value)} aria-label={`Switch to ${dark ? "light" : "dark"} theme`} title={`Switch to ${dark ? "light" : "dark"} theme`}>
    <span aria-hidden="true">{dark ? "☀" : "☾"}</span><span className={mobileIconOnly ? "toggle-label" : ""}>{dark ? "Light" : "Dark"}</span>
  </button>;
}
