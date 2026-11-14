import { SHELL_COPY } from './copy';

/** Top-left breadcrumb. It is the page's one h1: "Lunar Landing Site Navigator: Malapert Massif". */
export function Breadcrumb({ siteName }: { siteName: string }) {
  return (
    <h1 className="crumb">
      <span className="crumb__root">{SHELL_COPY.appName}</span>
      <span className="crumb__sep" aria-hidden="true">
        ›
      </span>
      <span className="sr-only">: </span>
      <b className="crumb__site">{siteName}</b>
    </h1>
  );
}
