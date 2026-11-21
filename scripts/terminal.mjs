// Draws terminal.svg: a retro terminal that switches on, types cat about.txt, neofetch (this account's numbers from
// GitHub), a heatmap of the last 26 weeks and fortune (a different quote each day), then blinks a cursor.
// Run daily by .github/workflows/terminal.yml; by hand:
//   GITHUB_TOKEN=$(gh auth token) node scripts/terminal.mjs terminal.svg
import fs from 'node:fs';

const LOGIN = 'Kizarov3';
const out = process.argv[2] || 'terminal.svg';
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!token) throw new Error('GITHUB_TOKEN is needed to ask GitHub for the numbers');

const QUERY = `query($login: String!) { user(login: $login) {
  createdAt
  repositories(ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, first: 100) { totalCount nodes {
    languages(first: 10, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name } } } } }
  contributionsCollection { totalCommitContributions restrictedContributionsCount
    contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } } } } }`;

async function numbers() {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST', headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'profile-terminal' },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json));
  const u = json.data.user, cc = u.contributionsCollection;
  const langs = new Map();
  for (const r of u.repositories.nodes) for (const e of r.languages.edges) langs.set(e.node.name, (langs.get(e.node.name) || 0) + e.size);
  const total = [...langs.values()].reduce((s, v) => s + v, 0) || 1;
  const weeks = cc.contributionCalendar.weeks.map((w) => w.contributionDays);
  const days = weeks.flat();
  let best = 0, run = 0;
  for (const d of days) { run = d.contributionCount ? run + 1 : 0; best = Math.max(best, run); }
  let streak = 0; // (today with nothing yet doesn't break it)
  for (let i = days.length - 1; i >= 0; i--) { if (days[i].contributionCount) streak++; else if (i < days.length - 1) break; }
  const avg = (n) => days.slice(-n).reduce((s, d) => s + d.contributionCount, 0) / n;
  return {
    since: new Date(u.createdAt), repos: u.repositories.totalCount,
    contributions: cc.contributionCalendar.totalContributions,
    commits: cc.totalCommitContributions + cc.restrictedContributionsCount,
    streak, best, load: [avg(1), avg(7), avg(30)], weeks,
    languages: [...langs].sort((a, b) => b[1] - a[1]).map(([name, size]) => ({ name, share: size / total })),
  };
}

function uptime(since, at = new Date()) {
  let months = (at.getFullYear() - since.getFullYear()) * 12 + at.getMonth() - since.getMonth();
  if (at.getDate() < since.getDate()) months--;
  const y = Math.floor(months / 12), m = months % 12, plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  if (!y && !m) return plural(Math.max(1, Math.round((at - since) / 864e5)), 'day');
  return [y && plural(y, 'year'), m && plural(m, 'month')].filter(Boolean).join(', ');
}

// fortune: one a day, the same all day.
const FORTUNES = [
  ['Talk is cheap. Show me the code.', 'Linus Torvalds'],
  ['Simplicity is prerequisite for reliability.', 'Edsger W. Dijkstra'],
  ['Premature optimization is the root of all evil.', 'Donald Knuth'],
  ['Make it work, make it right, make it fast.', 'Kent Beck'],
  ['Controlling complexity is the essence of computer programming.', 'Brian Kernighan'],
  ['When in doubt, use brute force.', 'Ken Thompson'],
  ['One of my most productive days was throwing away 1000 lines of code.', 'Ken Thompson'],
  ['Beware of bugs in the above code; I have only proved it correct, not tried it.', 'Donald Knuth'],
  ['Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away.', 'Antoine de Saint-Exupéry'],
  ['Real artists ship.', 'Steve Jobs'],
  ['Simple things should be simple, complex things should be possible.', 'Alan Kay'],
  ['The cheapest, fastest, and most reliable components are those that aren\'t there.', 'Gordon Bell'],
  ['Testing shows the presence, not the absence of bugs.', 'Edsger W. Dijkstra'],
  ['A language that doesn\'t affect the way you think about programming is not worth knowing.', 'Alan Perlis'],
  ['Optimism is an occupational hazard of programming; feedback is the treatment.', 'Kent Beck'],
  ['Walking on water and developing software from a specification are easy if both are frozen.', 'Edward V. Berard'],
  ['Programs must be written for people to read, and only incidentally for machines to execute.', 'Harold Abelson'],
  ['Any fool can write code that a computer can understand. Good programmers write code that humans can understand.', 'Martin Fowler'],
  ['There are only two hard things in Computer Science: cache invalidation and naming things.', 'Phil Karlton'],
  ['Code never lies, comments sometimes do.', 'Ron Jeffries'],
  ['Unix is user-friendly. It\'s just very selective about who its friends are.', 'Unknown'],
  ['There\'s no place like 127.0.0.1', 'Unknown'],
  ['It works on my machine.', 'Every developer, at some point'],
  ['Weeks of coding can save you hours of planning.', 'Unknown'],
];

// ---- drawing ----
const W = 880, FS = 15, CW = 9, LH = 22, X0 = 28, BAR = 30, PROMPT = 'kizarov3@github:~$';
const GREEN = '#3fdc6a', TEXT = '#d4f8dc', DIM = '#5b8a66', AMBER = '#ffb000', BG = '#0a0f0b';
const RAMP = ['#10261a', '#1a5c2c', '#2a9c48', '#3fdc6a', '#b8ffc8'];
const FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f2 = (v) => v.toFixed(2);
const run = (x, y, s, fill, extra = '') => `<text x="${f2(x)}" y="${y}" fill="${fill}" xml:space="preserve" style="white-space:pre" textLength="${f2(s.length * CW)}" lengthAdjust="spacingAndGlyphs"${extra}>${esc(s)}</text>`;
const appear = (t, inner) => `<g opacity="0"><set attributeName="opacity" to="1" begin="${f2(t)}s" fill="freeze"/>${inner}</g>`;
// (fortune's quote and its author on one line)
const ONE_LINE = FORTUNES.filter(([q, who]) => q.length + who.length + 3 <= Math.floor((W - 2 * X0) / CW));

function draw(n, today = new Date()) {
  const dayNo = Math.floor(today / 864e5);
  let seed = dayNo; // (the keys' rhythm, the same all day)
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const parts = [], clips = [];
  let t = 0.75, y = BAR + 30, clipNo = 0;
  const px = X0 + (PROMPT.length + 1) * CW;

  // text typed a letter at a time (unevenly, as hands do), the cursor going along
  const typed = (x, yy, s, fill, at, perKey, cursor) => {
    const steps = [0];
    for (let k = 0; k < s.length; k++) steps.push(steps[k] + perKey * (0.6 + rnd() * 0.9));
    const dur = steps[steps.length - 1] || 0.01, keys = steps.map((v) => (v / dur).toFixed(4)).join(';');
    const id = `c${clipNo++}`;
    clips.push(`<clipPath id="${id}"><rect x="${f2(x)}" y="${yy - FS}" width="0" height="${FS + 7}"><animate attributeName="width" values="${steps.map((_, k) => f2(k * CW)).join(';')}" keyTimes="${keys}" calcMode="discrete" begin="${f2(at)}s" dur="${f2(dur)}s" fill="freeze"/></rect></clipPath>`);
    parts.push(`<g clip-path="url(#${id})">${run(x, yy, s, fill)}</g>`);
    if (cursor) parts.push(`<rect x="${f2(x)}" y="${yy - FS + 2}" width="${CW}" height="${FS + 1}" fill="${GREEN}" opacity="0"><set attributeName="opacity" to="1" begin="${f2(at - 0.25)}s"/><set attributeName="opacity" to="0" begin="${f2(at + dur + 0.2)}s"/><animate attributeName="x" values="${steps.map((_, k) => f2(x + k * CW)).join(';')}" keyTimes="${keys}" calcMode="discrete" begin="${f2(at)}s" dur="${f2(dur)}s" fill="freeze"/></rect>`);
    return at + dur;
  };
  const command = (cmd) => {
    parts.push(appear(t, run(X0, y, PROMPT, GREEN)));
    t = typed(px, y, cmd, TEXT, t + 0.25, 0.075, true) + 0.2;
  };

  // 1. about
  command('cat about.txt'); y += LH;
  parts.push(appear(t, run(X0, y, "I make apps I'd want to use myself.", TEXT))); t += 0.4; y += LH + 12;

  // 2. neofetch: on the left a turning cube and the last 26 weeks as a heatmap, on the right the numbers
  command('neofetch'); y += LH + 8;
  const blockTop = y - FS + 2;
  // (a wireframe cube turning for good, as in the old demos)
  const boot = t, CUBE = 92, cx = X0 + 26 * 14 / 2, cy = blockTop + CUBE / 2, FRAMES = 48;
  const V = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
  const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  const frames = [...Array(FRAMES + 1).keys()].map((f) => {
    const a = (f / FRAMES) * 2 * Math.PI, b = 0.5 + 0.25 * Math.sin(a);
    return V.map(([x, y, z]) => {
      const x1 = x * Math.cos(a) + z * Math.sin(a), z1 = -x * Math.sin(a) + z * Math.cos(a);
      const y2 = y * Math.cos(b) - z1 * Math.sin(b), z2 = y * Math.sin(b) + z1 * Math.cos(b);
      const k = (CUBE * 0.22) * (5 / (5 + z2));
      return [cx + x1 * k, cy + y2 * k];
    });
  });
  const vals = (pick) => frames.map(pick).map(f2).join(';');
  const spin = `dur="8s" begin="${f2(boot)}s" repeatCount="indefinite"`;
  const edges = E.map(([i, j]) => `<line stroke="${GREEN}" stroke-width="1.6" stroke-linecap="round" x1="${f2(frames[0][i][0])}" y1="${f2(frames[0][i][1])}" x2="${f2(frames[0][j][0])}" y2="${f2(frames[0][j][1])}">${['x1', 'y1', 'x2', 'y2'].map((attr, n) => `<animate attributeName="${attr}" values="${vals((fr) => fr[n < 2 ? i : j][n % 2])}" ${spin}/>`).join('')}</line>`).join('');
  const dots = V.map((_, i) => `<circle r="2.4" fill="${TEXT}" cx="${f2(frames[0][i][0])}" cy="${f2(frames[0][i][1])}"><animate attributeName="cx" values="${vals((fr) => fr[i][0])}" ${spin}/><animate attributeName="cy" values="${vals((fr) => fr[i][1])}" ${spin}/></circle>`).join('');
  parts.push(appear(boot, `${edges}${dots}`));

  const weeks = n.weeks.slice(-26), hc = 11, hg = 3, hy = blockTop + CUBE + 14;
  const counts = n.weeks.flat().map((d) => d.contributionCount).filter(Boolean).sort((a, b) => a - b);
  const q = (p) => counts[Math.min(counts.length - 1, Math.floor(p * counts.length))] || 1;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const level = (c) => (!c ? 0 : c <= cuts[0] ? 1 : c <= cuts[1] ? 2 : c <= cuts[2] ? 3 : 4);
  const mapAt = boot + 0.3;
  weeks.forEach((week, wi) => {
    const cells = week.map((d, di) => {
      const day = new Date(`${d.date}T00:00:00Z`).getUTCDay();
      const isToday = wi === weeks.length - 1 && di === week.length - 1;
      const blink = isToday ? `<animate attributeName="opacity" values="1;.25" dur="1.06s" calcMode="discrete" repeatCount="indefinite" begin="${f2(mapAt + 1)}s"/>` : '';
      return `<rect x="${X0 + wi * (hc + hg)}" y="${hy + day * (hc + hg)}" width="${hc}" height="${hc}" rx="2" fill="${RAMP[level(d.contributionCount)]}">${blink}</rect>`;
    }).join('');
    parts.push(appear(mapAt + wi * 0.025, cells));
  });
  const mapW = weeks.length * (hc + hg) - hg, ly = hy + 7 * (hc + hg) + 12;
  const legendX = X0 + mapW - (4 * CW + 6 + 5 * (hc + hg) + 4 + 4 * CW);
  parts.push(appear(mapAt + 0.7, `${run(X0, ly, '26 weeks', DIM)}${run(legendX, ly, 'less', DIM)}${RAMP.map((c, i) => `<rect x="${f2(legendX + 4 * CW + 6 + i * (hc + hg))}" y="${ly - 10}" width="${hc}" height="${hc}" rx="2" fill="${c}"/>`).join('')}${run(legendX + 4 * CW + 6 + 5 * (hc + hg) + 4, ly, 'more', DIM)}`));

  const rx = X0 + mapW + 40;
  const top = n.languages.slice(0, 3).map((l) => `${l.name} ${Math.round(l.share * 100)}%`).join(', ');
  const rows = [
    ['', 'kizarov3@github'], ['', '─'.repeat(15)],
    ['Uptime', uptime(n.since, today)],
    ['Repos', `${n.repos} public`],
    ['Contributions', `${n.contributions.toLocaleString('en-US')} this year`],
    ['Commits', `${n.commits.toLocaleString('en-US')} this year`],
    ['Streak', `${n.streak} day${n.streak === 1 ? '' : 's'} (best ${n.best})`],
    ['Load avg', n.load.map((v) => v.toFixed(2)).join('  ')],
    ['Languages', top],
  ];
  rows.forEach(([k, v], i) => {
    const yy = y + i * LH, when = t + 0.045 * i;
    if (!k) parts.push(appear(when, run(rx, yy, v, i ? DIM : GREEN, i ? '' : ' font-weight="bold"')));
    else parts.push(appear(when, `${run(rx, yy, `${k}:`, AMBER, ' opacity=".9"')}${run(rx + (k.length + 2) * CW, yy, v, TEXT)}`));
  });
  t += 0.045 * rows.length;
  // the languages as a bar in the screen's own greens
  const barY = y + rows.length * LH - 10;
  let bx = rx;
  const bw = W - X0 - rx, bar = n.languages.filter((l) => l.share >= 0.01), shares = bar.reduce((s, l) => s + l.share, 0) || 1;
  const greens = ['#3fdc6a', '#2a9c48', '#b8ffc8', '#1a5c2c', '#7ef0a0'];
  const segs = bar.map((l, i) => { const w = (l.share / shares) * bw, r = `<rect x="${f2(bx)}" y="${barY}" width="${f2(Math.max(0, w - 2))}" height="7" fill="${greens[i % greens.length]}"/>`; bx += w; return r; }).join('');
  clips.push(`<clipPath id="bar"><rect x="${rx}" y="${barY}" width="0" height="7"><animate attributeName="width" from="0" to="${bw}" begin="${f2(t)}s" dur="0.6s" fill="freeze"/></rect></clipPath>`);
  parts.push(`<g clip-path="url(#bar)">${segs}</g>`);
  t = Math.max(t + 0.6, mapAt + 0.9);
  y = Math.max(barY + 7, ly) + 36;

  // 3. fortune, one a day
  command('fortune'); y += LH;
  const [quote, who] = ONE_LINE[dayNo % ONE_LINE.length];
  t = typed(X0, y, quote, TEXT, t, 0.016, false) + 0.15;
  parts.push(appear(t, run(X0 + (quote.length + 1) * CW, y, `— ${who}`, AMBER, ' opacity=".9"')));
  t += 0.5; y += LH + 12;

  // and the cursor, blinking for good
  parts.push(appear(t, `${run(X0, y, PROMPT, GREEN)}<rect x="${f2(px)}" y="${y - FS + 2}" width="${CW}" height="${FS + 1}" fill="${GREEN}"><animate attributeName="opacity" values="1;0" dur="1.06s" calcMode="discrete" repeatCount="indefinite" begin="${f2(t)}s"/></rect>`));
  const H = y + 20;
  const label = `A retro terminal. cat about.txt: I make apps I'd want to use myself. neofetch: ${rows.slice(2).map(([k, v]) => `${k} ${v}`).join('; ')}, beside a heatmap of the last 26 weeks. fortune: ${quote} (${who})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
<defs>
<filter id="glow" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<pattern id="scan" width="3" height="3" patternUnits="userSpaceOnUse"><rect width="3" height="1" fill="#000" opacity=".35"/></pattern>
<radialGradient id="vignette" cx="50%" cy="50%" r="75%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".55"/></radialGradient>
<linearGradient id="band" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<clipPath id="screen"><rect width="${W}" height="${H}" rx="12"/></clipPath>
${clips.join('\n')}
</defs>
<g clip-path="url(#screen)">
<rect width="${W}" height="${H}" fill="${BG}"/>
<rect width="${W}" height="${BAR}" fill="#121a14"/>
<circle cx="20" cy="15" r="5" fill="#ff5f57" opacity=".85"/><circle cx="37" cy="15" r="5" fill="#febc2e" opacity=".85"/><circle cx="54" cy="15" r="5" fill="#28c840" opacity=".85"/>
<text x="${W / 2}" y="19" fill="${DIM}" font-size="12" text-anchor="middle" font-family="${FONT}">kizarov3 — zsh</text>
<g font-family="${FONT}" font-size="${FS}" filter="url(#glow)">
${parts.join('\n')}
</g>
<rect y="${BAR}" width="${W}" height="${H - BAR}" fill="url(#scan)"/>
<rect x="0" y="-70" width="${W}" height="70" fill="url(#band)"><animate attributeName="y" values="-70;${H}" dur="6s" begin="1s" repeatCount="indefinite"/></rect>
<rect width="${W}" height="${H}" fill="#000" opacity="0"><animate attributeName="opacity" values="0;.08;0;.05;0" keyTimes="0;.96;.97;.985;1" calcMode="discrete" dur="11s" begin="3s" repeatCount="indefinite"/></rect>
<rect width="${W}" height="${H}" fill="url(#vignette)"/>
<rect x="0" y="${H / 2 - 1}" width="${W}" height="2" fill="#d4f8dc"><animate attributeName="y" values="${H / 2 - 1};${BAR}" dur="0.35s" begin="0.15s" fill="freeze"/><animate attributeName="height" values="2;${H - BAR}" dur="0.35s" begin="0.15s" fill="freeze"/><animate attributeName="opacity" values="1;.7;0" dur="0.5s" begin="0.15s" fill="freeze"/></rect>
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="12" fill="none" stroke="#2a3a2e"/>
</svg>
`;
}

const n = await numbers();
fs.writeFileSync(out, draw(n));
console.log(JSON.stringify({ ...n, weeks: n.weeks.length, languages: n.languages.slice(0, 4).map((l) => `${l.name} ${(l.share * 100).toFixed(1)}%`) }));
