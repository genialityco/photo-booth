import PhotoBoothWizard from "./components/public/PhotoBoothWizard";

export default function Page() {
  return (
    <PhotoBoothWizard
      //frameSrc="/images/marco.png"
      mirror
      boxSize="min(88vw, 70svh)"
    />
  );
}
