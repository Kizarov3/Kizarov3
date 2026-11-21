# python3 make-terminal.py terminal.svg
# Builds terminal.svg: a retro terminal that types two commands and their answers, then blinks a cursor.
import html, sys
W, H = 880, 292
FS, CW = 18, 10.8            # font size, monospace advance (0.6em); textLength pins each run to it
X0, PROMPT = 32, "kizarov3@github:~$"
GAP = 1  # (the space after the prompt: a run of its own would be collapsed)
GREEN, TEXT, DIM, BG = "#3fdc6a", "#d4f8dc", "#5b8a66", "#0a0f0b"

def run(x, y, s, fill, extra=""):
    return f'<text x="{x}" y="{y}" fill="{fill}" textLength="{len(s)*CW:.1f}" lengthAdjust="spacingAndGlyphs"{extra}>{html.escape(s)}</text>'

out, clips, t = [], [], 0.6
lines = [("whoami", "kizarov3"), ("cat about.txt", "I make apps I'd want to use myself.")]
y = 92
for i, (cmd, answer) in enumerate(lines):
    px = X0 + (len(PROMPT) + GAP) * CW
    start, per = t, 0.09
    show = f'<set attributeName="opacity" to="1" begin="{t:.2f}s" fill="freeze"/>'
    out.append(f'<g opacity="0">{show}{run(X0, y, PROMPT, GREEN)}</g>')
    # the command, typed a letter at a time
    widths = ";".join(f"{k*CW:.1f}" for k in range(len(cmd) + 1))
    keys = ";".join(f"{k/len(cmd):.4f}" for k in range(len(cmd) + 1))
    dur = per * len(cmd)
    clips.append(f'<clipPath id="c{i}"><rect x="{px}" y="{y-FS}" width="0" height="{FS+8}"><animate attributeName="width" values="{widths}" keyTimes="{keys}" calcMode="discrete" begin="{start+0.35:.2f}s" dur="{dur:.2f}s" fill="freeze"/></rect></clipPath>')
    out.append(f'<g clip-path="url(#c{i})">{run(px, y, cmd, TEXT)}</g>')
    # a cursor at the end of what's typed, until the answer comes
    cx = ";".join(f"{px + k*CW:.1f}" for k in range(len(cmd) + 1))
    out.append(f'<rect x="{px}" y="{y-FS+3}" width="{CW:.1f}" height="{FS+1}" fill="{GREEN}" opacity="0">'
               f'<set attributeName="opacity" to="1" begin="{start:.2f}s"/><set attributeName="opacity" to="0" begin="{start+0.35+dur+0.25:.2f}s"/>'
               f'<animate attributeName="x" values="{cx}" keyTimes="{keys}" calcMode="discrete" begin="{start+0.35:.2f}s" dur="{dur:.2f}s" fill="freeze"/></rect>')
    t = start + 0.35 + dur + 0.3
    y += 32
    out.append(f'<g opacity="0"><set attributeName="opacity" to="1" begin="{t:.2f}s" fill="freeze"/>{run(X0, y, answer, TEXT if i else GREEN)}</g>')
    t += 0.55
    y += 44
# the last prompt, its cursor blinking for good
out.append(f'<g opacity="0"><set attributeName="opacity" to="1" begin="{t:.2f}s" fill="freeze"/>{run(X0, y, PROMPT, GREEN)}'
           f'<rect x="{X0 + (len(PROMPT) + GAP)*CW:.1f}" y="{y-FS+3}" width="{CW:.1f}" height="{FS+1}" fill="{GREEN}">'
           f'<animate attributeName="opacity" values="1;0" dur="1.06s" calcMode="discrete" repeatCount="indefinite" begin="{t:.2f}s"/></rect></g>')

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="A terminal: whoami answers kizarov3; cat about.txt answers I make apps I'd want to use myself.">
<defs>
<filter id="glow" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#000" opacity=".35"/></pattern>
<radialGradient id="vignette" cx="50%" cy="50%" r="75%"><stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".55"/></radialGradient>
<clipPath id="screen"><rect x="0" y="0" width="{W}" height="{H}" rx="14"/></clipPath>
{"".join(clips)}
</defs>
<g clip-path="url(#screen)">
<rect width="{W}" height="{H}" fill="{BG}"/>
<rect width="{W}" height="38" fill="#121a14"/>
<circle cx="24" cy="19" r="6" fill="#ff5f57" opacity=".85"/><circle cx="44" cy="19" r="6" fill="#febc2e" opacity=".85"/><circle cx="64" cy="19" r="6" fill="#28c840" opacity=".85"/>
<text x="{W/2}" y="24" fill="{DIM}" font-size="13" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace">kizarov3 — zsh</text>
<g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace" font-size="{FS}" filter="url(#glow)">
{chr(10).join(out)}
</g>
<rect y="38" width="{W}" height="{H-38}" fill="url(#scan)"/>
<rect width="{W}" height="{H}" fill="url(#vignette)"/>
</g>
<rect x=".5" y=".5" width="{W-1}" height="{H-1}" rx="14" fill="none" stroke="#2a3a2e"/>
</svg>
'''
open(sys.argv[1], "w").write(svg)
print("ends typing at", round(t, 2), "s")
