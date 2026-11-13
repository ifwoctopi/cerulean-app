import { Link } from "react-router-dom";
import { Hero } from "@/components/Hero";
import { Timeline, useShootStops } from "@/components/Timeline";
import { CastBoard } from "@/components/CastBoard";
import { Reveal } from "@/components/Motion";
import { AnnouncementsSection } from "@/components/Announcements";

export default function Home() {
  const { stops, heading } = useShootStops();
  return (
    <>
      <Hero />
      <main className="page">
        <AnnouncementsSection />
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
              <p>Asante works the front desk at a nursing home in a small town that a company called Perceptron keeps trying to buy, one property at a time. She oversleeps, she's on her last warning, and her best friend Gaia is the only one still covering for her.</p>
              <p>Then the storm hits. The residents, the staff and half the town end up in an emergency shelter run by a calm woman named Michaela, who promises rescue in a week. Asante, Gaia and Eli set up camp next to a stranger named David and a furious teenager named Sage.</p>
              <p>Inside, the days stop adding up. Asante loses hours at a time. Her dreams leak into the hallways. People who were there yesterday are gone, and nobody else remembers them. And at night, the lights turn blue.</p>
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
