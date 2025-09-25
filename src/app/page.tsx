/* eslint-disable react-hooks/exhaustive-deps */
"use client";

// import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import Page from "./home/page";
export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const initCamera = async () => {
      try {
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

    initCamera();

    return () => {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream)
          .getTracks()
          .forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <>
    <div className="antialiased min-h-screen relative">

     <div
          className="fixed inset-0 -z-10 bg-cover bg-center "
          style={{ backgroundImage: "url('/images/frame.jpg')" }}
        />
      <Page />
    </div>
    </>
  );
}
