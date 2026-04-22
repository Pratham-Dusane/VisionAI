import sys
import re

# Fix CSS
css_file = 'c:/Users/Samruddhi/projects/VisionAI/frontend/app/globals.css'
with open(css_file, 'r', encoding='utf-8') as f:
    c = f.read()

# Marquee gap
c = c.replace('gap: 40px;\n  width: max-content;\n  animation: marquee-scroll 30s linear infinite;', 'gap: 80px;\n  width: max-content;\n  animation: marquee-scroll 30s linear infinite;')
c = c.replace('gap: 40px;\r\n  width: max-content;\r\n  animation: marquee-scroll 30s linear infinite;', 'gap: 80px;\r\n  width: max-content;\r\n  animation: marquee-scroll 30s linear infinite;')

# Section blobs
c = c.replace('filter: blur(80px);\n  opacity: 0.15;', 'filter: blur(100px);\n  opacity: 0.3;')
c = c.replace('filter: blur(80px);\r\n  opacity: 0.15;', 'filter: blur(100px);\r\n  opacity: 0.3;')
c = c.replace('width: 400px; height: 400px;', 'width: 600px; height: 600px;')
c = c.replace('width: 350px; height: 350px;', 'width: 550px; height: 550px;')
c = c.replace('width: 300px; height: 300px;', 'width: 500px; height: 500px;')

# Bento Grid CSS replacement
bento_css = '''/* ---- Benefits - Clean 3x2 Bento Grid ---- */
.about-bento-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}
.about-bento-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 24px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  transition: transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}
.about-bento-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.1);
  border-color: var(--primary);
}
.about-bento-icon {
  margin-bottom: 20px;
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  color: var(--primary);
}
.about-bento-card h3 {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 8px;
  color: var(--fg);
}
.about-bento-card p {
  font-size: 15px;
  line-height: 1.6;
  color: var(--muted);
  margin: 0;
}
@media (max-width: 900px) {
  .about-bento-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 600px) {
  .about-bento-grid { grid-template-columns: 1fr; }
}'''

c = re.sub(r'/\* ---- Benefits - Alternating Rows ---- \*/.*?@media \(max-width: 768px\) \{.*?\}', bento_css, c, flags=re.DOTALL)

with open(css_file, 'w', encoding='utf-8') as f:
    f.write(c)


# Fix page.tsx
page_file = 'c:/Users/Samruddhi/projects/VisionAI/frontend/app/(public)/about/page.tsx'
with open(page_file, 'r', encoding='utf-8') as f:
    p = f.read()

# Remove two rects from SVG
svg_replacement = '''{/* Overlapping wireframes SVG matching reference */}
            <svg viewBox=\"0 0 500 500\" className=\"about-hero-wireframes\" style={{ color: '#1B2B4A' }}>
              <defs>
                <pattern id=\"dot-grid\" x=\"0\" y=\"0\" width=\"20\" height=\"20\" patternUnits=\"userSpaceOnUse\">
                  <circle cx=\"2\" cy=\"2\" r=\"1.5\" fill=\"currentColor\" opacity=\"0.4\" />
                </pattern>
                <linearGradient id=\"pane-grad\" x1=\"0%\" y1=\"0%\" x2=\"100%\" y2=\"100%\">
                  <stop offset=\"0%\" stopColor=\"white\" stopOpacity=\"0.4\" />
                  <stop offset=\"100%\" stopColor=\"white\" stopOpacity=\"0.05\" />
                </linearGradient>
                <marker id=\"arrowhead\" markerWidth=\"6\" markerHeight=\"6\" refX=\"5\" refY=\"3\" orient=\"auto\">
                  <path d=\"M0,0 L6,3 L0,6\" fill=\"none\" stroke=\"currentColor\" strokeWidth=\"1.5\" />
                </marker>
              </defs>

              {/* Dot Grids */}
              <rect x=\"120\" y=\"220\" width=\"60\" height=\"80\" fill=\"url(#dot-grid)\" transform=\"rotate(-15 150 260)\" />
              <rect x=\"360\" y=\"240\" width=\"60\" height=\"80\" fill=\"url(#dot-grid)\" transform=\"rotate(10 390 280)\" />

              {/* Back Right Pane */}
              <g className=\"wireframe-2\">
                <rect x=\"260\" y=\"90\" width=\"160\" height=\"200\" rx=\"16\" stroke=\"currentColor\" strokeWidth=\"2.5\" fill=\"url(#pane-grad)\" transform=\"rotate(12 340 190)\" />
              </g>

              {/* Bottom Horizontal Pane */}
              <g className=\"wireframe-3\">
                <rect x=\"140\" y=\"240\" width=\"260\" height=\"140\" rx=\"20\" stroke=\"currentColor\" strokeWidth=\"2.5\" fill=\"url(#pane-grad)\" transform=\"rotate(-18 270 310)\" />
                <path d=\"M 120 280 L 220 330\" stroke=\"currentColor\" strokeWidth=\"1.5\" markerEnd=\"url(#arrowhead)\" />
              </g>
              
              {/* Front Left Vertical Pane */}
              <g className=\"wireframe-1\">
                <rect x=\"110\" y=\"160\" width=\"110\" height=\"180\" rx=\"16\" stroke=\"currentColor\" strokeWidth=\"2.5\" fill=\"url(#pane-grad)\" transform=\"rotate(-8 165 250)\" />
                <path d=\"M 215 200 L 290 150\" stroke=\"currentColor\" strokeWidth=\"1.5\" markerEnd=\"url(#arrowhead)\" />
              </g>

              {/* Decorative Elements */}
              <circle cx=\"340\" cy=\"60\" r=\"6\" stroke=\"currentColor\" strokeWidth=\"2\" fill=\"none\" />
              <circle cx=\"160\" cy=\"130\" r=\"10\" stroke=\"currentColor\" strokeWidth=\"2\" fill=\"none\" />
              <circle cx=\"260\" cy=\"280\" r=\"8\" stroke=\"currentColor\" strokeWidth=\"2\" fill=\"none\" />
              
              <text x=\"180\" y=\"90\" fill=\"currentColor\" fontSize=\"20\" fontFamily=\"monospace\" fontWeight=\"bold\">{'{'}</text>
              <text x=\"430\" y=\"230\" fill=\"currentColor\" fontSize=\"18\" fontFamily=\"monospace\" fontWeight=\"bold\">{'</>'}</text>
            </svg>'''

p = re.sub(r'\{\/\* Overlapping wireframes SVG matching reference \*\/}.*?<\/svg>', svg_replacement, p, flags=re.DOTALL)


# Update Benefits Grid
bento_replacement = '''<div className=\"about-bento-grid\">
            {BENEFITS.map((b) => (
              <div key={b.title} className=\"about-bento-card\">
                <div className=\"about-bento-icon\"><b.icon size={24} strokeWidth={1.8} /></div>
                <h3>{b.title}</h3>
                <p>{b.desc}</p>
              </div>
            ))}
          </div>'''
p = re.sub(r'<div className=\"about-benefits-list\">.*?<\/div>\s*<\/div>\s*<\/section>', bento_replacement + '\\n        </div>\\n      </section>', p, flags=re.DOTALL)

with open(page_file, 'w', encoding='utf-8') as f:
    f.write(p)
