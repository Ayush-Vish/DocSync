import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { ArtifactFrame } from "./ArtifactFrame";
import type { Content } from "../document";

export interface PresentationViewerProps {
  sections: Content["sections"];
  initialSlide?: number;
  title?: string;
  onClose: () => void;
  onSlideChange?: (index: number) => void;
}

function PreviousButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      className="presentation-ctrl-btn"
      title="Previous slide (← / PageUp)"
      aria-label="Previous slide"
      disabled={disabled}
      onClick={onClick}
    >
      <ChevronLeft className="w-4 h-4" />
    </button>
  );
}

function NextButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      className="presentation-ctrl-btn"
      title="Next slide (→ / Space / Enter)"
      aria-label="Next slide"
      disabled={disabled}
      onClick={onClick}
    >
      <ChevronRight className="w-4 h-4" />
    </button>
  );
}

function SlideCounter({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  const currentStr = String(current + 1).padStart(2, "0");
  const totalStr = String(total).padStart(2, "0");
  return (
    <span className="presentation-counter" aria-live="polite">
      {currentStr} / {totalStr}
    </span>
  );
}

function ExitButton({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      type="button"
      className="presentation-ctrl-btn"
      title="Exit presentation (Esc)"
      aria-label="Exit presentation"
      onClick={onClick}
    >
      <X className="w-4 h-4" />
    </button>
  );
}

function PresentationControls({
  currentSlide,
  totalSlides,
  visible,
  onPrev,
  onNext,
  onExit,
}: {
  currentSlide: number;
  totalSlides: number;
  visible: boolean;
  onPrev: (e: React.MouseEvent) => void;
  onNext: (e: React.MouseEvent) => void;
  onExit: (e: React.MouseEvent) => void;
}) {
  return (
    <nav
      className={`presentation-controls ${visible ? "visible" : "hidden"}`}
      aria-label="Presentation navigation"
      onClick={(e) => e.stopPropagation()}
    >
      <PreviousButton disabled={currentSlide === 0} onClick={onPrev} />
      <SlideCounter current={currentSlide} total={totalSlides} />
      <NextButton disabled={currentSlide >= totalSlides - 1} onClick={onNext} />
      <div className="presentation-ctrl-divider" aria-hidden="true" />
      <ExitButton onClick={onExit} />
    </nav>
  );
}

function SlideContent({
  section,
  title,
}: {
  section: Content["sections"][number];
  title: string;
}) {
  return (
    <div className="presentation-slide-content">
      <ArtifactFrame
        title={title}
        section={section}
        fitSlide
      />
    </div>
  );
}

function SlideRenderer({
  section,
  slideIndex,
  presentationTitle,
}: {
  section: Content["sections"][number];
  slideIndex: number;
  presentationTitle: string;
}) {
  return (
    <div className="presentation-slide-renderer" key={section.id || slideIndex}>
      <SlideContent
        section={section}
        title={`${presentationTitle} - Slide ${slideIndex + 1}`}
      />
    </div>
  );
}

function PresentationCanvas({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <main
      className="presentation-canvas"
      role="region"
      aria-label="Slide canvas"
      onClick={onClick}
    >
      {children}
    </main>
  );
}

export function PresentationViewer({
  sections,
  initialSlide = 0,
  title = "Presentation",
  onClose,
  onSlideChange,
}: PresentationViewerProps) {
  const [currentSlide, setCurrentSlide] = useState(() =>
    Math.max(0, Math.min(sections.length - 1, initialSlide))
  );
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimerRef = useRef<number | null>(null);
  const touchStartXRef = useRef<number | null>(null);

  const goToSlide = useCallback(
    (index: number) => {
      const nextIndex = Math.max(0, Math.min(sections.length - 1, index));
      setCurrentSlide(nextIndex);
      onSlideChange?.(nextIndex);
    },
    [sections.length, onSlideChange]
  );

  const prevSlide = useCallback(() => {
    goToSlide(currentSlide - 1);
  }, [currentSlide, goToSlide]);

  const nextSlide = useCallback(() => {
    goToSlide(currentSlide + 1);
  }, [currentSlide, goToSlide]);

  const resetHideTimer = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, 2500);
  }, []);

  useEffect(() => {
    resetHideTimer();
    const onMouseMove = () => resetHideTimer();
    window.addEventListener("mousemove", onMouseMove);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, [resetHideTimer]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      resetHideTimer();
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (
        e.key === "ArrowRight" ||
        e.key === "PageDown" ||
        e.key === " " ||
        e.key === "Enter"
      ) {
        e.preventDefault();
        nextSlide();
      } else if (
        e.key === "ArrowLeft" ||
        e.key === "PageUp" ||
        e.key === "Backspace"
      ) {
        e.preventDefault();
        prevSlide();
      } else if (e.key === "Home") {
        e.preventDefault();
        goToSlide(0);
      } else if (e.key === "End") {
        e.preventDefault();
        goToSlide(sections.length - 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextSlide, prevSlide, goToSlide, onClose, resetHideTimer, sections.length]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    resetHideTimer();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    if (Math.abs(deltaX) > 40) {
      if (deltaX < 0) {
        nextSlide();
      } else {
        prevSlide();
      }
    }
    touchStartXRef.current = null;
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(".presentation-controls")) return;
    if (currentSlide < sections.length - 1) {
      nextSlide();
    }
  };

  const currentSection = sections[currentSlide];

  return (
    <div
      className={`presentation-viewer ${controlsVisible ? "" : "cursor-hidden"}`}
      role="dialog"
      aria-modal="true"
      aria-label="Presentation Mode"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={resetHideTimer}
    >
      <PresentationCanvas onClick={handleCanvasClick}>
        {currentSection && (
          <SlideRenderer
            section={currentSection}
            slideIndex={currentSlide}
            presentationTitle={title}
          />
        )}
      </PresentationCanvas>

      <PresentationControls
        currentSlide={currentSlide}
        totalSlides={sections.length}
        visible={controlsVisible}
        onPrev={(e) => {
          e.stopPropagation();
          prevSlide();
        }}
        onNext={(e) => {
          e.stopPropagation();
          nextSlide();
        }}
        onExit={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
    </div>
  );
}
