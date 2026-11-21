// Draws terminal.svg: a retro terminal that switches on, types cat about.txt, neofetch (this account's numbers from
// GitHub), a heatmap of the last year's contributions and fortune (a different quote each day), then blinks a cursor.
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
const W = 880, FS = 18, CW = 10.8, X0 = 32, PROMPT = 'kizarov3@github:~$';
const GREEN = '#3fdc6a', TEXT = '#d4f8dc', DIM = '#5b8a66', AMBER = '#ffb000', BG = '#0a0f0b';
const RAMP = ['#10261a', '#1a5c2c', '#2a9c48', '#3fdc6a', '#b8ffc8'];
const FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f2 = (v) => v.toFixed(2);
const run = (x, y, s, fill, extra = '') => `<text x="${f2(x)}" y="${y}" fill="${fill}" xml:space="preserve" style="white-space:pre" textLength="${f2(s.length * CW)}" lengthAdjust="spacingAndGlyphs"${extra}>${esc(s)}</text>`;
const appear = (t, inner) => `<g opacity="0"><set attributeName="opacity" to="1" begin="${f2(t)}s" fill="freeze"/>${inner}</g>`;
const PIXELS = { // 5×7
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
};

function wrap(text, width) {
  const lines = [''];
  for (const word of text.split(' ')) {
    const last = lines[lines.length - 1];
    if (last && (last + ' ' + word).length > width) lines.push(word);
    else lines[lines.length - 1] = last ? `${last} ${word}` : word;
  }
  return lines;
}

function draw(n, today = new Date()) {
  const dayNo = Math.floor(today / 864e5);
  let seed = dayNo; // (the keys' rhythm, the same all day)
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const parts = [], clips = [];
  let t = 0.75, y = 72, clipNo = 0;
  const px = X0 + (PROMPT.length + 1) * CW;

  // text typed a letter at a time (unevenly, as hands do), the cursor going along
  const typed = (x, yy, s, fill, at, perKey, cursor) => {
    const steps = [0];
    for (let k = 0; k < s.length; k++) steps.push(steps[k] + perKey * (0.6 + rnd() * 0.9));
    const dur = steps[steps.length - 1] || 0.01, keys = steps.map((v) => (v / dur).toFixed(4)).join(';');
    const id = `c${clipNo++}`;
    clips.push(`<clipPath id="${id}"><rect x="${f2(x)}" y="${yy - FS}" width="0" height="${FS + 8}"><animate attributeName="width" values="${steps.map((_, k) => f2(k * CW)).join(';')}" keyTimes="${keys}" calcMode="discrete" begin="${f2(at)}s" dur="${f2(dur)}s" fill="freeze"/></rect></clipPath>`);
    parts.push(`<g clip-path="url(#${id})">${run(x, yy, s, fill)}</g>`);
    if (cursor) parts.push(`<rect x="${f2(x)}" y="${yy - FS + 3}" width="${CW}" height="${FS + 1}" fill="${GREEN}" opacity="0"><set attributeName="opacity" to="1" begin="${f2(at - 0.35)}s"/><set attributeName="opacity" to="0" begin="${f2(at + dur + 0.25)}s"/><animate attributeName="x" values="${steps.map((_, k) => f2(x + k * CW)).join(';')}" keyTimes="${keys}" calcMode="discrete" begin="${f2(at)}s" dur="${f2(dur)}s" fill="freeze"/></rect>`);
    return at + dur;
  };
  const command = (cmd) => {
    parts.push(appear(t, run(X0, y, PROMPT, GREEN)));
    t = typed(px, y, cmd, TEXT, t + 0.25, 0.075, true) + 0.2;
  };

  // 1. about
  command('cat about.txt'); y += 32;
  parts.push(appear(t, run(X0, y, "I make apps I'd want to use myself.", TEXT))); t += 0.4; y += 46;

  // 2. neofetch: K3 in pixels on the left, the numbers on the right
  command('neofetch'); y += 40;
  const LH = 26, rx = X0 + 190, cell = 12, gap = 2, logoTop = y + 2;
  const logo = [];
  ['K', '3'].forEach((ch, li) => PIXELS[ch].forEach((row, r) => [...row].forEach((on, c) => {
    if (on === '1') logo.push({ x: X0 + 4 + li * 84 + c * (cell + gap), y: logoTop + r * (cell + gap), r });
  })));
  const boot = t;
  const pixels = (fill) => logo.map((p) => `<rect x="${p.x}" y="${p.y}" width="${cell}" height="${cell}" fill="${fill}"/>`).join('');
  // (row by row as it boots)
  for (let r = 0; r < 7; r++) parts.push(appear(boot + r * 0.04, logo.filter((p) => p.r === r).map((p) => `<rect x="${p.x}" y="${p.y}" width="${cell}" height="${cell}" fill="${GREEN}"/>`).join('')));
  // (and a glitch every 6 s: shifted, with red and cyan ghosts)
  const glitch = (fill, dx) => `<g opacity="0">${pixels(fill)}<animate attributeName="opacity" values="0;.45;0" keyTimes="0;.98;1" calcMode="discrete" dur="6s" begin="${f2(boot + 2)}s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0 0;${dx} 0;0 0" keyTimes="0;.98;1" calcMode="discrete" dur="6s" begin="${f2(boot + 2)}s" repeatCount="indefinite"/></g>`;
  parts.push(glitch('#ff3b5c', -3), glitch('#36e0ff', 3));
  const top = n.languages.slice(0, 3).map((l) => `${l.name} ${Math.round(l.share * 100)}%`).join(' · ');
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
  y += rows.length * LH - 8;
  t += 0.045 * rows.length;
  // the languages as a bar in the screen's own greens
  let bx = rx;
  const bw = 400, bar = n.languages.filter((l) => l.share >= 0.01), shares = bar.reduce((s, l) => s + l.share, 0) || 1;
  const greens = ['#3fdc6a', '#2a9c48', '#b8ffc8', '#1a5c2c', '#7ef0a0'];
  const segs = bar.map((l, i) => { const w = (l.share / shares) * bw, r = `<rect x="${f2(bx)}" y="${y}" width="${f2(Math.max(0, w - 2))}" height="8" fill="${greens[i % greens.length]}"/>`; bx += w; return r; }).join('');
  clips.push(`<clipPath id="bar"><rect x="${rx}" y="${y}" width="0" height="8"><animate attributeName="width" from="0" to="${bw}" begin="${f2(t)}s" dur="0.6s" fill="freeze"/></rect></clipPath>`);
  parts.push(`<g clip-path="url(#bar)">${segs}</g>`);
  t += 0.7; y += 58;

  // 3. the last year as a heatmap, column by column, today's cell blinking
  command('git log --since=1.year | heatmap'); y += 22;
  const counts = n.weeks.flat().map((d) => d.contributionCount).filter(Boolean).sort((a, b) => a - b);
  const q = (p) => counts[Math.min(counts.length - 1, Math.floor(p * counts.length))] || 1;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const level = (c) => (!c ? 0 : c <= cuts[0] ? 1 : c <= cuts[1] ? 2 : c <= cuts[2] ? 3 : 4);
  const hc = 12, hg = 3, cols = n.weeks.length, hx = X0 + Math.round((W - 2 * X0 - cols * (hc + hg) + hg) / 2);
  const sweep = 0.8 / cols;
  n.weeks.forEach((week, wi) => {
    const cells = week.map((d) => {
      const di = new Date(`${d.date}T00:00:00Z`).getUTCDay();
      const isToday = wi === cols - 1 && d === week[week.length - 1];
      const blink = isToday ? `<animate attributeName="opacity" values="1;.25" dur="1.06s" calcMode="discrete" repeatCount="indefinite" begin="${f2(t + 1)}s"/>` : '';
      return `<rect x="${hx + wi * (hc + hg)}" y="${y + di * (hc + hg)}" width="${hc}" height="${hc}" rx="2" fill="${RAMP[level(d.contributionCount)]}">${blink}</rect>`;
    }).join('');
    parts.push(appear(t + wi * sweep, cells));
  });
  y += 7 * (hc + hg) + 18;
  t += 0.9;
  const legendX = hx + cols * (hc + hg) - hg - (4 * CW + 6 + 5 * (hc + hg) + 4 + 4 * CW); // (right under the map's right edge)
  parts.push(appear(t, `${run(hx, y, `${n.contributions.toLocaleString('en-US')} contributions in the last year`, DIM)}${run(legendX, y, 'less', DIM)}${RAMP.map((c, i) => `<rect x="${f2(legendX + 4 * CW + 6 + i * (hc + hg))}" y="${y - 11}" width="${hc}" height="${hc}" rx="2" fill="${c}"/>`).join('')}${run(legendX + 4 * CW + 6 + 5 * (hc + hg) + 4, y, 'more', DIM)}`));
  t += 0.4; y += 48;

  // 4. fortune
  command('fortune'); y += 32;
  const [quote, who] = FORTUNES[dayNo % FORTUNES.length];
  for (const line of wrap(quote, 72)) { t = typed(X0, y, line, TEXT, t, 0.016, false); y += 26; }
  t += 0.15;
  parts.push(appear(t, run(X0 + 2 * CW, y, `— ${who}`, AMBER, ' opacity=".9"')));
  t += 0.5; y += 46;

  // and the cursor, blinking for good
  parts.push(appear(t, `${run(X0, y, PROMPT, GREEN)}<rect x="${f2(px)}" y="${y - FS + 3}" width="${CW}" height="${FS + 1}" fill="${GREEN}"><animate attributeName="opacity" values="1;0" dur="1.06s" calcMode="discrete" repeatCount="indefinite" begin="${f2(t)}s"/></rect>`));
  const H = y + 28;
  const label = `A retro terminal. cat about.txt: I make apps I'd want to use myself. neofetch: ${rows.slice(2).map(([k, v]) => `${k} ${v}`).join('; ')}. A heatmap of ${n.contributions} contributions in the last year. fortune: ${quote} (${who})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
<defs>
<filter id="glow" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#000" opacity=".35"/></pattern>
<radialGradient id="vignette" cx="50%" cy="50%" r="75%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".55"/></radialGradient>
<linearGradient id="band" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<clipPath id="screen"><rect width="${W}" height="${H}" rx="14"/></clipPath>
${clips.join('\n')}
</defs>
<g clip-path="url(#screen)">
<rect width="${W}" height="${H}" fill="${BG}"/>
<rect width="${W}" height="38" fill="#121a14"/>
<circle cx="24" cy="19" r="6" fill="#ff5f57" opacity=".85"/><circle cx="44" cy="19" r="6" fill="#febc2e" opacity=".85"/><circle cx="64" cy="19" r="6" fill="#28c840" opacity=".85"/>
<text x="${W / 2}" y="24" fill="${DIM}" font-size="13" text-anchor="middle" font-family="${FONT}">kizarov3 — zsh</text>
<g font-family="${FONT}" font-size="${FS}" filter="url(#glow)">
${parts.join('\n')}
</g>
<rect y="38" width="${W}" height="${H - 38}" fill="url(#scan)"/>
<rect x="0" y="-80" width="${W}" height="80" fill="url(#band)"><animate attributeName="y" values="-80;${H}" dur="7s" begin="1s" repeatCount="indefinite"/></rect>
<rect width="${W}" height="${H}" fill="#000" opacity="0"><animate attributeName="opacity" values="0;.08;0;.05;0" keyTimes="0;.96;.97;.985;1" calcMode="discrete" dur="11s" begin="3s" repeatCount="indefinite"/></rect>
<rect width="${W}" height="${H}" fill="url(#vignette)"/>
<g><rect x="0" y="${H / 2 - 1}" width="${W}" height="2" fill="#d4f8dc"><animate attributeName="y" values="${H / 2 - 1};38" dur="0.35s" begin="0.15s" fill="freeze"/><animate attributeName="height" values="2;${H - 38}" dur="0.35s" begin="0.15s" fill="freeze"/><animate attributeName="opacity" values="1;.7;0" dur="0.5s" begin="0.15s" fill="freeze"/></rect></g>
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="14" fill="none" stroke="#2a3a2e"/>
</svg>
`;
}

const n = await numbers();
fs.writeFileSync(out, draw(n));
console.log(JSON.stringify({ ...n, weeks: n.weeks.length, languages: n.languages.slice(0, 4).map((l) => `${l.name} ${(l.share * 100).toFixed(1)}%`) }));
