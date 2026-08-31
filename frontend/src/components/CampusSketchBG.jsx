import React, { useState } from "react";
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

  // 6 distinct campus sketch GIFs positioned cleanly without overlap
  const gifs = [
    { key: "blr", src: blrGif, alt: "Bengaluru Campus", className: "sketch-gif gif-top-left" },
    { key: "cbe", src: cbeGif, alt: "Coimbatore Campus", className: "sketch-gif gif-top-right" },
    { key: "chn", src: chnGif, alt: "Chennai Campus", className: "sketch-gif gif-mid-left" },
    { key: "fbd", src: fbdGif, alt: "Faridabad Campus", className: "sketch-gif gif-mid-right" },
    { key: "khi", src: khiGif, alt: "Kollam Campus", className: "sketch-gif gif-bottom-left" },
    { key: "mys", src: mysGif, alt: "Mysuru Campus", className: "sketch-gif gif-bottom-right" },
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
