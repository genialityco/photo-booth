import PhotoBoothWizard from "./components/public/PhotoBoothWizard";
import { Suspense } from "react";
export default function Page() {
  return (
    <Suspense fallback={<div>Cargando...</div>}>
      <PhotoBoothWizard
        //frameSrc="/images/marco.png"
        mirror
        boxSize="min(50vw, 70svh)"
      />
    </Suspense>
  );
}
