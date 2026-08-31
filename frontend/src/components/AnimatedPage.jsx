import React from "react";

export default function AnimatedPage({ children, className = "" }) {
  return (
    <div className={`page-transition-enter ${className}`}>
      {children}
    </div>
  );
}
