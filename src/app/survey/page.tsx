// app/survey/page.tsx
import { Suspense } from "react";
import SurveyClient from "./SurveyClient";

// Evita prerender/SSG si depende de query params dinámicos:
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SurveyClient />
    </Suspense>
  );
}
