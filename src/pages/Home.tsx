import { Link } from "react-router-dom";
import { Hero } from "@/components/Hero";
import { Timeline, useShootStops } from "@/components/Timeline";
import { CastBoard } from "@/components/CastBoard";
import { Reveal } from "@/components/Motion";
import { AnnouncementsSection } from "@/components/Announcements";
import { YourCalls } from "@/components/YourCalls";

export default function Home() {
  const { stops, heading } = useShootStops();
  return (
    <>
      <Hero />
      <main className="page">
        <AnnouncementsSection />
        <YourCalls />
        <Reveal>
          <section className="synopsis" aria-labelledby="syn-h">
            <div className="page-head">
              <div className="slate">Logline</div>
              <h2 id="syn-h">Nobody else remembers</h2>
              <dl className="facts">
                <div><dt>Written by</dt><dd>Staci Tranquille</dd></div>
                <div><dt>Genre</dt><dd>Sci-fi thriller</dd></div>
                <div><dt>Shoot</dt><dd>Nov 29 – Dec 18, 2026</dd></div>
                <div><dt>Shoot days</dt><dd>11</dd></div>
                <div><dt>Locations</dt><dd>8 · Greensboro, NC</dd></div>
              </dl>
            </div>
            <div>
              <p>Displaced by disaster, Asante takes refuge in a government relief shelter. The beds are warm, the staff are kind, and the dreams won't stop. Some shelters keep you safe. Others keep you.</p>
              <p>At its core, Cerulean Tether is about how governments and corporations take advantage of low-income communities and communities of color when they're at their most vulnerable.</p>
              <p>As climate change makes disasters more frequent, more people will be displaced, and more communities will be exposed to that kind of exploitation.</p>
            </div>
          </section>
        </Reveal>

        <section aria-labelledby="tl-h" style={{ display: "grid", gap: 14 }}>
          <Reveal>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "end" }}>
              <div className="page-head"><div className="slate">Film Schedule</div><h2 id="tl-h">{heading}</h2></div>
              <Link className="btn small" to="/calendar">Open the calendar</Link>
            </div>
          </Reveal>
          <Timeline stops={stops} />
        </section>

        <CastBoard />
      </main>
    </>
  );
}
