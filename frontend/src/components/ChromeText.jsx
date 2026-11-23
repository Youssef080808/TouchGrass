import { useId } from 'react'

/**
 * Puffy liquid-chrome lettering (like inflated metal): the glyph shapes are blurred into a height map and
 * lit from the top left with an SVG lighting filter. Works in every browser, no WebGL. Sized by `size`
 * (font size in px); the text stays real text for screen readers.
 */
export default function ChromeText({ children, size = 96, className, tone = '#dcdce2' }) {
  const id = useId().replace(/:/g, '')
  const text = String(children)
  const width = Math.ceil(size * 0.72 * text.length + size * 0.3)
  const height = Math.ceil(size * 1.25)
  const blur = Math.max(1.2, size * 0.05)
  const depth = Math.max(3, size * 0.085)
  return (
    <svg role="img" aria-label={text} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} style={{ overflow: 'visible' }}>
      <defs>
        <filter id={`chrome-${id}`} x="-15%" y="-40%" width="130%" height="180%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation={blur} result="b" />
          <feDiffuseLighting in="b" surfaceScale={depth} diffuseConstant="1.15" lightingColor={tone} result="d">
            <feDistantLight azimuth="235" elevation="38" />
          </feDiffuseLighting>
          <feSpecularLighting in="b" surfaceScale={depth} specularConstant="1.25" specularExponent="38" lightingColor="#ffffff" result="sp">
            <feDistantLight azimuth="225" elevation="52" />
          </feSpecularLighting>
          <feComposite in="d" in2="sp" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lit" />
          <feComposite in="lit" in2="SourceAlpha" operator="in" result="body" />
          <feDropShadow in="body" dx="0" dy={size * 0.05} stdDeviation={size * 0.06} floodColor="#000" floodOpacity="0.55" />
        </filter>
      </defs>
      <text
        x="50%"
        y={size * 0.98}
        textAnchor="middle"
        fontFamily="'Barlow Condensed', sans-serif"
        fontWeight="800"
        fontSize={size}
        fill="#fff"
        filter={`url(#chrome-${id})`}
      >
        {text}
      </text>
    </svg>
  )
}
