// Source: https://codepen.io/goodkatz/pen/LYPGxQz
// Modified to
// 1. use tailwind styles
// 2. handle dark mode and light mode colors
// 3. background effect instead of foreground
export default function Wave() {
  return (
    <>
      <div className="h-24 bg-sky-200 dark:bg-sky-900 absolute -z-10 min-w-full print:hidden"></div>
      <div className="top-24 bg-sky-200 dark:bg-sky-900 absolute min-w-full -z-10 print:hidden">
        <svg
          className="relative w-full h-32 min-h-[100px] max-h-[150px]"
          viewBox="0 24 150 28"
          preserveAspectRatio="none"
          shapeRendering="auto"
        >
          <defs>
            <path
              id="gentle-wave"
              d="M-160 44c30 0 58-18 88-18s 58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z"
            />
          </defs>
          <g className="parallax">
            <use className="fill-white/70 dark:fill-gray-900/70" href="#gentle-wave" x="48" y="0" />
            <use className="fill-white/50 dark:fill-gray-900/50" href="#gentle-wave" x="48" y="3" />
            <use className="fill-white/30 dark:fill-gray-900/30" href="#gentle-wave" x="48" y="5" />
            <use className="fill-white dark:fill-gray-900" href="#gentle-wave" x="48" y="7" />
          </g>
        </svg>
      </div>
    </>
  )
}
