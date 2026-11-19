import React, { useState } from "react";
import ampGif from "../assets/campus_gifs/Amp.gif";
import amvGif from "../assets/campus_gifs/Amv.gif";
import blrGif from "../assets/campus_gifs/Blr.gif";
import cbeGif from "../assets/campus_gifs/Cbe.gif";
import chnGif from "../assets/campus_gifs/Chn.gif";
import fbdGif from "../assets/campus_gifs/Fbd.gif";
import khiGif from "../assets/campus_gifs/Khi.gif";
import mysGif from "../assets/campus_gifs/Mys.gif";

export default function CampusSketchBG() {
  const [loadedState, setLoadedState] = useState({});

  const handleLoad = (key) => {
    setLoadedState((prev) => ({ ...prev, [key]: true }));
  };

  const handleError = (key) => {
    setLoadedState((prev) => ({ ...prev, [key]: false }));
  };

  // Authentic Amrita University campus sketch GIFs positioned gracefully around cards
  const gifs = [
    { key: "amv-top-left", src: amvGif, alt: "Amrita Coimbatore Campus", className: "sketch-gif gif-top-left" },
    { key: "amp-top-right", src: ampGif, alt: "Amrita Amritapuri Campus", className: "sketch-gif gif-top-right" },
    { key: "chn-mid-left", src: chnGif, alt: "Amrita Chennai Campus", className: "sketch-gif gif-mid-left" },
    { key: "fbd-mid-right", src: fbdGif, alt: "Amrita Faridabad Campus", className: "sketch-gif gif-mid-right" },
    { key: "khi-bottom-left", src: khiGif, alt: "Amrita Kollam Campus", className: "sketch-gif gif-bottom-left" },
    { key: "blr-bottom-right", src: blrGif, alt: "Amrita Bengaluru Campus", className: "sketch-gif gif-bottom-right" },
  ];

  return (
    <div className="campus-sketch-overlay" aria-hidden="true">
      {gifs.map((item) => (
        <img
          key={item.key}
          src={item.src}
          alt={item.alt}
          className={item.className}
          onLoad={() => handleLoad(item.key)}
          onError={() => handleError(item.key)}
          style={{ display: loadedState[item.key] === false ? "none" : "block" }}
        />
      ))}
    </div>
  );
}
