'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function LandingAnimations() {
  useGSAP(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
      gsap.set('[data-animate]', { clearProps: 'all' });
      return;
    }

    gsap
      .timeline({ defaults: { ease: 'power3.out' } })
      .from('[data-animate="hero"]', {
        autoAlpha: 0,
        y: 24,
        duration: 0.85,
        stagger: 0.08,
      });

    gsap.utils.toArray<HTMLElement>('[data-float]').forEach((element, index) => {
      gsap.to(element, {
        y: index % 2 === 0 ? -12 : 12,
        duration: 3.2 + index * 0.35,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
      });
    });

    gsap.utils.toArray<HTMLElement>('[data-animate="reveal"]').forEach(element => {
      gsap.from(element, {
        autoAlpha: 0,
        y: 28,
        duration: 0.75,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: element,
          start: 'top 94%',
          once: true,
        },
      });
    });

    gsap.from('[data-animate="code"]', {
      autoAlpha: 0,
      y: 28,
      duration: 0.8,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: '[data-animate="code"]',
        start: 'top 82%',
        once: true,
      },
    });

    gsap.from('[data-animate="code"] pre code', {
      clipPath: 'inset(0 100% 0 0)',
      duration: 1.15,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: '[data-animate="code"]',
        start: 'top 72%',
        once: true,
      },
    });

    gsap.fromTo(
      '[data-flow-line]',
      { scaleX: 0, transformOrigin: 'left center' },
      {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: '[data-flow-line]',
          start: 'top 78%',
          end: 'bottom 48%',
          scrub: true,
        },
      },
    );
  });

  return null;
}
