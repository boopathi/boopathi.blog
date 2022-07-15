// Source: https://codepen.io/goodkatz/pen/LYPGxQz
// Modified to
// 1. use tailwind styles
// 2. handle dark mode and light mode colors
// 3. background effect instead of foreground
export default function Wave() {
  return (
    <>
      <div className="absolute -z-10 h-24 min-w-full bg-sky-200 dark:bg-sky-900 print:hidden"></div>
      <div className="absolute top-24 -z-10 min-w-full bg-sky-200 dark:bg-sky-900 print:hidden">
        <svg
          className="relative h-32 max-h-[150px] min-h-[100px] w-full"
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
