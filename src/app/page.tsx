/* eslint-disable react-hooks/exhaustive-deps */
"use client";

// import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ButtonPrimary from "@/app/items/ButtonPrimary";
import Page from "./home/page";
export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [enabledCamara, setEnabledCamara] = useState(false);

  const initCamera = async () => {
    try {
      setEnabledCamara(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 320 }, height: { ideal: 240 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error al acceder a la cámara:", err);
    }
  };

  // return () => {
  //   // if (videoRef.current?.srcObject) {
  //   //   (videoRef.current.srcObject as MediaStream)
  //   //     .getTracks()
  //   //     .forEach((track) => track.stop());
  //   // }
  // };

  return (
    <>
      <div className="antialiased min-h-screen relative">
        <div
          className="fixed inset-0 -z-10 bg-cover bg-center "
          style={{ backgroundImage: "url('/images/frame.jpg')" }}
        />
        {!enabledCamara ? (
          <ButtonPrimary
            onClick={initCamera}
            label={"habilitar camara"}
            imageSrc="/images/btn_principal.png"
            width={220}
            height={68}
            ariaLabel="habilitar camara"
          />
        ) : (
          <Page />
        )}
      </div>
    </>
  );
}
