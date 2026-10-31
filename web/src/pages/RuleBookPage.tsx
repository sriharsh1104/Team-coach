const MINDSET = [
  {
    title: 'Review Every Custom Match',
    body: 'Har custom ke baad apni mistakes discuss karo. Blame nahi, solutions chahiye.',
  },
  {
    title: 'Never Give Up on a Match Set',
    body: 'Saare matches khelne hain — bad performance ke baad quit option nahi hai.',
  },
  {
    title: 'Team Comes Before Individual Ego',
    body: 'Personal kill count se zyada important team ka result hai.',
  },
];

const GAMEPLAY = [
  {
    title: 'Never Take an Unplanned Fight',
    body: 'Open rush tabhi jab information, utility, ya support ho.',
  },
  {
    title: 'Communicate with Useful Callouts',
    body: 'Callouts short, clear, actionable — location, knock, numbers, support.',
  },
  {
    title: 'Position Before Kills',
    body: 'Strong compound aur zone advantage kabhi-kabhi extra kills se zyada valuable hain.',
  },
];

export function RuleBookPage() {
  return (
    <>
      <div className="topbar">
        <div>
          <h1>Rule Book</h1>
          <p>Rules every competitive player must follow</p>
        </div>
      </div>
      <div className="content">
        <h2>Mindset & Discipline</h2>
        <div className="rules">
          {MINDSET.map((r, i) => (
            <div key={r.title} className="rule">
              <h3>
                {i + 1}. {r.title}
              </h3>
              <p>{r.body}</p>
            </div>
          ))}
        </div>
        <h2 style={{ marginTop: 24 }}>Gameplay & Practice</h2>
        <div className="rules">
          {GAMEPLAY.map((r, i) => (
            <div key={r.title} className="rule">
              <h3>
                {i + 1}. {r.title}
              </h3>
              <p>{r.body}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
